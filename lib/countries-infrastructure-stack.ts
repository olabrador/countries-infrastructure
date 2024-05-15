import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as secretsManager from 'aws-cdk-lib/aws-secretsmanager';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export class CountriesInfrastructureStack extends cdk.Stack {
  private readonly databaseName = 'countries';
  private readonly databaseUsername = 'countriesroot';

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'CountriesVPC', {
      maxAzs: 2,
    });

    const dbCredentialsSecret = new secretsManager.Secret(this, 'CountriesDBCredentials', {
      secretName: 'rds-credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: this.databaseUsername }),
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
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      multiAz: false,
      allocatedStorage: 20,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      publiclyAccessible: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      deletionProtection: false,
      databaseName: this.databaseName,
    });

    // Exposing the database password to lambda, assuming it is ok to have it in AWS infrastructure
    const password = dbCredentialsSecret.secretValueFromJson('password').unsafeUnwrap();
    const migrationFunction = new lambda.Function(this, 'CountriesMigrationFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset('lambda', {
        bundling: {
          image: lambda.Runtime.NODEJS_20_X.bundlingImage,
          command: [
            'bash',
            '-c',
            'npm install && npx webpack && cp -r dist/* /asset-output/ && cp -r data/ /asset-output/',
          ],
          environment: {
            'npm_config_cache': '/tmp/.npm-cache',
          },
        },
      }),
      handler: 'populate-db.handler',
      environment: {
        RDS_HOST: rdsInstance.dbInstanceEndpointAddress,
        RDS_PORT: rdsInstance.dbInstanceEndpointPort,
        RDS_USER: this.databaseUsername,
        RDS_PASSWORD: password,
        RDS_DBNAME: this.databaseName,
      },
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [rdsInstance.connections.securityGroups[0]],
    });

    dbCredentialsSecret.grantRead(migrationFunction);

    rdsInstance.grantConnect(migrationFunction);

    new cdk.CfnOutput(this, 'MigrationFunctionName', { value: migrationFunction.functionName });
  }
}
