const Binance = require('binance-api-node').default
const Bot = require('./bot.js');
const { sleep, getConfig, saveConfig } = require('./utils.js');
const config = require('./config.json');
const { Telegraf, Markup, Scenes, session, Composer } = require("telegraf");

const bot = new Telegraf(config.telegramBotToken);

async function iter() {
    console.log('iter')

    const config = await getConfig("config.json");
    const internal = await getConfig("internal.json");

    // const client = Binance({
    //     apiKey: '0a07e6a7a13fdd9b6cdaa9af3b6dae7ffdaa2405638e0cfc14dd90bce7da6c63',
    //     apiSecret: 'db6be003468b4d9750d8d2a4f28710e759ca1190065cdb5b6e8df7d91ac26066',
    //     httpFutures: 'https://testnet.binancefuture.com',
    //     wsFutures: 'wss://stream.binancefuture.com'
    // })
    // const client = Binance({
    //     apiKey: config.binanceApiKey,
    //     apiSecret: config.binanceSecretKey,
    //     httpFutures: 'https://testnet.binancefuture.com',
    //     wsFutures: 'wss://stream.binancefuture.com'
    // })

    const client = Binance({
        apiKey: config.binanceApiKey,
        apiSecret: config.binanceSecretKey,
        getTime: () => Date.now(),
    })

    console.log(`initied`)

    if(Date.now() < config.tradingLock + internal.tradingLastLockDate) {
        console.log(`STOP TRAIDING`);

        await cancelAllFutures(client);

        return;
    }


    let accountInfo, futuresPrices;

    try {
        accountInfo = await client.futuresAccountInfo();
        futuresPrices = await client.futuresPrices();
    } catch (error) {
        console.log('ошибка 1');
        console.log(error);

        return;
    }

    console.log(`accountInfo, futuresPrices`)
    

    const openPositions = accountInfo.positions.filter(e => parseFloat(e.positionAmt) !== 0).map(position => {
        const symbol = position['symbol']
        const entry_price = parseFloat(position['entryPrice'])    
        // const mark_price =  parseFloat((await client.futuresMarkPrice()).find(e => e.symbol == symbol).markPrice)
        const lastPrice = parseFloat(futuresPrices[symbol])
        const position_amount = parseFloat(position['positionAmt'])

        let direction = 1;

        if(position_amount < 0)
            direction = -1

        const leverage = parseInt(position['leverage'])

        const contract_multiplier = 1
        const imr = 1 / leverage
        const unrealized_pnl = position_amount * direction * (lastPrice - entry_price) * contract_multiplier
        const entry_margin = position_amount * contract_multiplier * lastPrice * imr
        const roe = unrealized_pnl / entry_margin * 100
        
        position.unrealizedPnl = unrealized_pnl * direction;
        position.roe = roe;

        return position;
    });

    const totalUnrealizedPnl = openPositions.reduce((prev, cur) => {
        return prev + cur.unrealizedPnl;
    }, 0);


    const totalWalletBalance = parseFloat(accountInfo.totalWalletBalance);

    if(!internal.maxTotalWalletBalance) internal.maxTotalWalletBalance = totalWalletBalance;
    if(internal.maxTotalWalletBalance < totalWalletBalance) {
        internal.maxTotalWalletBalance = totalWalletBalance;
    }

    const totalWalletBalanceIncPnl = totalWalletBalance + totalUnrealizedPnl;

    const curProfitPercent = 100 - (internal.maxTotalWalletBalance / totalWalletBalanceIncPnl) * 100

    let state = ``;
    state += `открытые позиции\n`;
    state += `${openPositions.map(e => `${e.symbol} ${e.roe.toFixed(2)}% (${e.unrealizedPnl.toFixed(2)})`).join('\n')}\n`;
    state += '\n'

    state += `максимальный сохраненный баланс: ${internal.maxTotalWalletBalance.toFixed(2)}\n`;
    state += `текущий баланс: ${totalWalletBalance.toFixed(2)}\n`;
    state += `Unrealized PNL: ${totalUnrealizedPnl.toFixed(2)}\n`;
    state += `текущий баланс с учетом unPNL: ${totalWalletBalanceIncPnl.toFixed(2)}\n`;
    state += `текущая просадка/профит относительно максимального сохраненного баланса: ${curProfitPercent.toFixed(2)}%\n`;
    state += `допустимая просадка/профит: ${config.maxLoss.toFixed(2)}%\n`;
    
    console.log(state)


    internal.state = state;

    console.log(`await saveConfig`)

    await saveConfig(internal, "internal.json");

    console.log(`await savedConfig`)

    if(curProfitPercent < config.maxLoss) {
        console.log('ALARM');
        bot.telegram.sendMessage(
            `${config.telegramUsername}`, `Торговля заблокирована. Разблокировка торговли: ${new Date(Date.now() + config.tradingLock).toLocaleString("ru", {timeZone: 'Europe/Moscow'})}`
        );

        internal.maxTotalWalletBalance = undefined;
        internal.tradingLastLockDate = Date.now();

        internal.state = `разблокировка торговли: ${new Date(Date.now() + config.tradingLock).toLocaleString("ru", {timeZone: 'Europe/Moscow'})}`

        await saveConfig(internal, "internal.json");

        await cancelAllFutures(client);
    }

    console.log(`END`)
}

async function cancelAllFutures(client) {
    const openOrders = (await client.futuresOpenOrders())
    const positions = (await client.futuresAccountInfo()).positions.filter(e => Math.abs(parseFloat(e.positionAmt)) != 0)

    for(const openOrder of openOrders) {
        console.log(`Cancel openOrder ${openOrder.symbol} #${openOrder.orderId}`);

        const result = await client.futuresCancelOrder({
            orderId: openOrder.orderId,
            symbol: openOrder.symbol
        }).catch((e) => {
            console.log(e);
        });
    }

    for(const position of positions) {
        console.log(`Canceled position ${position.symbol} #${position.positionSide}`);

        const result = await client.futuresOrder({
            "symbol": position.symbol,
            "type": "MARKET",
            "side": parseFloat(position.positionAmt) < 0 ? "BUY" : "SELL",
            "quantity": Math.abs(parseFloat(position.positionAmt)),
            "positionSide": "BOTH",
            "leverage": position.leverage,
            "isolated": position.isolated,
            "reduceOnly": true,
            "newOrderRespType": "RESULT",
            "placeType": "position"
        }).catch((e) => {
            console.log(e);
        });
    }
}



setTimeout(() => {
    throw new Error('too long')
}, 60000);

iter();