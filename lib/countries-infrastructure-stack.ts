import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as secretsManager from 'aws-cdk-lib/aws-secretsmanager';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export class CountriesInfrastructureStack extends cdk.Stack {
  private readonly databaseName = 'countries';

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'CountriesVPC', {
      maxAzs: 2,
    });

    const dbCredentialsSecret = new secretsManager.Secret(this, 'CountriesDBCredentials', {
      secretName: 'rds-credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'admin' }),
        excludePunctuation: true,
        includeSpace: false,
        generateStringKey: 'password',
      },
    });

    const rdsInstance = new rds.DatabaseInstance(this, 'CountriesDB', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_2,
      }),
      vpc,
      credentials: rds.Credentials.fromSecret(dbCredentialsSecret),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE2, ec2.InstanceSize.MICRO),
      multiAz: false,
      allocatedStorage: 2,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      publiclyAccessible: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      deletionProtection: false,
      databaseName: this.databaseName,
    });

    const migrationFunction = new lambda.Function(this, 'CountriesMigrationFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset('lambda'),
      handler: 'populate-db.handler',
      environment: {
        RDS_HOST: rdsInstance.dbInstanceEndpointAddress,
        RDS_PORT: rdsInstance.dbInstanceEndpointPort,
        RDS_USER: dbCredentialsSecret.secretValueFromJson('username').toString(),
        RDS_PASSWORD: dbCredentialsSecret.secretValueFromJson('password').toString(),
        RDS_DBNAME: this.databaseName,
      },
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [rdsInstance.connections.securityGroups[0]],
    });

    dbCredentialsSecret.grantRead(migrationFunction);

    rdsInstance.grantConnect(migrationFunction);
  }
}
