const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

async function connectToDB() {
  const client = new Client({
    host: process.env.RDS_HOST,
    port: parseInt(process.env.RDS_PORT, 10),
    user: process.env.RDS_USER,
    password: process.env.RDS_PASSWORD,
    database: process.env.RDS_DBNAME,
  });

  await client.connect();

  return client;
}

async function createTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS countries (
      id SERIAL PRIMARY KEY,
      country VARCHAR(255) UNIQUE NOT NULL,
      country_name VARCHAR(255) NOT NULL,
      performance_oriented FLOAT,
      autocratic FLOAT,
      modesty FLOAT,
      country_cluster VARCHAR(255),
      charisma FLOAT,
      decisive FLOAT
    );
  `);
}

function extractData(filePath) {
  return new Promise((resolve, reject) => {
    const countries = [];
    const country_names = [];
    const performance_orienteds = [];
    const autocratics = [];
    const modestys = [];
    const country_clusters = [];
    const charismas = [];
    const decisives = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => {
        countries.push(data.country);
        country_names.push(data.country_name);
        performance_orienteds.push(parseFloat(data.performance_oriented));
        autocratics.push(parseFloat(data.autocratic));
        modestys.push(parseFloat(data.modesty));
        country_clusters.push(data.country_cluster);
        charismas.push(parseFloat(data.charismatic_value_based_global_leadership_dimension));
        decisives.push(parseFloat(data.decisive));
      })
      .on('end', () => {
        resolve([
          countries,
          country_names,
          performance_orienteds,
          autocratics,
          modestys,
          country_clusters,
          charismas,
          decisives,
        ]);
      })
      .on('error', reject);
  });
}

async function seedData(client, filePath) {
  const csvData = await extractData(filePath);
  const query = `
    INSERT INTO countries (country, country_name, performance_oriented, autocratic, modesty, country_cluster, charisma, decisive)
    SELECT * FROM UNNEST($1::text[], $2::text[], $3::float[], $4::float[], $5::float[], $6::text[], $7::float[], $8::float[])
    ON CONFLICT (country) DO UPDATE SET
      country_name = EXCLUDED.country_name,
      performance_oriented = EXCLUDED.performance_oriented,
      autocratic = EXCLUDED.autocratic,
      modesty = EXCLUDED.modesty,
      country_cluster = EXCLUDED.country_cluster,
      charisma = EXCLUDED.charisma,
      decisive = EXCLUDED.decisive
  `;

  await client.query(query, csvData);
}

exports.handler = async () => {
  const client = await connectToDB();

  try {
    await createTable(client);

    const filePath = path.resolve(__dirname, 'data', 'globe_phase_2_aggregated_leadership_data.csv');
    await seedData(client, filePath);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Migration and seeding completed successfully' }),
    };
  } catch (error) {
    console.error('Error during migration and seeding', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error' }),
    };
  } finally {
    await client.end();
  }
};
