const Binance = require('binance-api-node').default
const Bot = require('./bot.js');
const { sleep, getConfig, saveConfig } = require('./utils.js');
const config = require('./config.json');

const bot = new Bot(config.telegramBotToken);