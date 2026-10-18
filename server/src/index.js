const mongoose = require('mongoose');
const config = require('./config');
const { createApp } = require('./app');

async function main() {
  await mongoose.connect(config.mongoUri);
  console.log(`MongoDB terhubung: ${config.mongoUri.replace(/\/\/.*@/, '//***@')}`);
  createApp().listen(config.port, () => console.log(`ITSM API berjalan di http://localhost:${config.port}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
