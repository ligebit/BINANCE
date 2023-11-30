const { Telegraf, Markup, Scenes, session, Composer } = require("telegraf");
const { getConfig, saveConfig } = require("./utils.js");


const setSettingsScene = new Scenes.WizardScene(
    "setSettingsScene",
    async (ctx) => {
        await ctx.reply(
            "введите binance api key"
        );
        ctx.wizard.state.data = {};
        return ctx.wizard.next();
    },
    async (ctx) => {
        ctx.wizard.state.data.binanceApiKey = ctx?.message?.text;

        ctx.reply(
            "введите binance secret key",
        );
        return ctx.wizard.next();
    },
    async (ctx) => {
        ctx.wizard.state.data.binanceSecretKey = ctx?.message?.text;

        ctx.reply(
            "Выберете или введите максимальную просадку, писать число с -, например",
            Markup.inlineKeyboard([
                [
                    Markup.button.callback("0%", 0),
                    Markup.button.callback("-10%", -10),
                    Markup.button.callback("-20%", -20),
                    Markup.button.callback("-50%", -50),
                ],
            ])
        );
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx?.callbackQuery?.data) {
            ctx.wizard.state.data.maxLoss = parseFloat(ctx.callbackQuery.data);
            await ctx.answerCbQuery();
        } else if (ctx?.message?.text)
            ctx.wizard.state.data.maxLoss = parseFloat(ctx.message.text);

        if (
            ctx.wizard.state.data.maxLoss === undefined ||
            isNaN(ctx.wizard.state.data.maxLoss)
        ) {
            return await ctx.reply(
                `Ошибка ввода: "${
                    ctx?.callbackQuery?.data || ctx?.message?.text
                }"`
            );
        }

        if (ctx.wizard.state.data.maxLoss > 0) {
            return await ctx.reply(
                `Ошибка ввода, число > 0: "${
                    ctx?.callbackQuery?.data || ctx?.message?.text
                }"`
            );
        }

        ctx.reply(
            "Выберете или введите время блокировки трейдинга, в часах",
            Markup.inlineKeyboard([
                [
                    Markup.button.callback("без блокировки", 0),
                    Markup.button.callback("1 минута", 1 / 60),
                    Markup.button.callback("16 часов", 16),
                    Markup.button.callback("24 часа", 24),
                ],
            ])
        );

        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx?.callbackQuery?.data) {
            ctx.wizard.state.data.tradingLock =
                parseFloat(ctx.callbackQuery.data) * 1000 * 60 * 60;
            await ctx.answerCbQuery();
        } else if (ctx?.message?.text)
            ctx.wizard.state.data.tradingLock =
                parseFloat(ctx.message.text) * 1000 * 60 * 60;

        if (
            ctx.wizard.state.data.tradingLock === undefined ||
            isNaN(ctx.wizard.state.data.tradingLock)
        ) {
            await ctx.reply(
                `Ошибка ввода: "${
                    ctx?.callbackQuery?.data || ctx?.message?.text
                }"`
            );
            return ctx.wizard.back();
        }

        if (ctx.wizard.state.data.tradingLock < 0) {
            await ctx.reply(
                `Ошибка ввода, число < 0: "${
                    ctx?.callbackQuery?.data || ctx?.message?.text
                }"`
            );
            return ctx.wizard.back();
        }

        ctx.reply(
            "Выберете или введите время блокировки изменеий настроек, в часах",
            Markup.inlineKeyboard([
                [
                    Markup.button.callback("без блокировки", 0),
                    Markup.button.callback("1 минута", 1 / 60),
                    Markup.button.callback("24 часа", 24),
                    Markup.button.callback("7 дней", 7 * 24),
                ],
            ])
        );

        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx?.callbackQuery?.data) {
            ctx.wizard.state.data.settingsLock =
                parseFloat(ctx.callbackQuery.data) * 1000 * 60 * 60;
            await ctx.answerCbQuery();
        } else if (ctx?.message?.text)
            ctx.wizard.state.data.settingsLock =
                parseFloat(ctx.message.text) * 1000 * 60 * 60;

        if (
            ctx.wizard.state.data.settingsLock === undefined ||
            ctx.wizard.state.data.settingsLock === NaN
        ) {
            await ctx.reply(
                `Ошибка ввода: "${
                    ctx?.callbackQuery?.data || ctx?.message?.text
                }"`
            );
            return ctx.wizard.back();
        }

        if (ctx.wizard.state.data.settingsLock < 0) {
            await ctx.reply(
                `Ошибка ввода, число < 0: "${
                    ctx?.callbackQuery?.data || ctx?.message?.text
                }"`
            );
            return ctx.wizard.back();
        }

        // ctx.wizard.state.data.phone = ctx.message.text;
        ctx.reply(
            `Вы уверены?\nbinance api key: ${
                ctx.wizard.state.data.binanceApiKey
            }\nbinance secret key: ${
                ctx.wizard.state.data.binanceSecretKey
            }\nдопустимая просадка: ${ctx.wizard.state.data.maxLoss.toFixed(
                4
            )}%\nвремя блокировки трейдинга: ${(
                ctx.wizard.state.data.tradingLock /
                (1000 * 60 * 60)
            ).toFixed(4)} часов\nвремя блокировки изменения настроек: ${(
                ctx.wizard.state.data.settingsLock /
                (1000 * 60 * 60)
            ).toFixed(4)} часов`,
            Markup.inlineKeyboard([
                [Markup.button.callback("Подтвердить", "accept")],
                [Markup.button.callback("Отмена", "reject")],
            ])
        );
    }
);

setSettingsScene.action("reject", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply("отменено");
    return ctx.scene.leave();
});

setSettingsScene.action("accept", async (ctx) => {
    try {
        await ctx.answerCbQuery();
        let config = await getConfig("config.json");

        if (config.settingsLastChangeDate + config.settingsLock > Date.now())
            return ctx.reply(
                `изменение настроек заблокировано до ${new Date(
                    config.settingsLastChangeDate + config.settingsLock
                )}`
            );

        config.tradingLock = ctx.wizard.state.data.tradingLock;
        config.maxLoss = ctx.wizard.state.data.maxLoss;
        config.settingsLock = ctx.wizard.state.data.settingsLock;
        config.settingsLastChangeDate = Date.now();

        config.binanceApiKey = ctx.wizard.state.data.binanceApiKey;
        config.binanceSecretKey = ctx.wizard.state.data.binanceSecretKey;

        await saveConfig(config, "config.json");
        await ctx.reply("принято");
        return ctx.scene.leave();
    } catch (e) {
        await ctx.reply(`ошибка: ${e}`);
        return ctx.scene.leave();
    }
});

module.exports = class Bot {
    constructor(token) {
        this.telegraf = new Telegraf(token);

        this.telegraf.use(async (ctx, next) => {
            const config = await getConfig("config.json");

            if(ctx.from.id == config.telegramUsername) {
                await next();
            } else {
                return ctx.reply('вы не авторизованы');
            }
        })
        this.telegraf.use(session());

        const stage = new Scenes.Stage([setSettingsScene]);

        this.telegraf.use(stage.middleware());

        this.telegraf.start((ctx) => {
            ctx.reply(
                "Меню",
                Markup.keyboard([["Настройки"], ["Состояние"]]).resize()
            );
        });

        this.telegraf.hears("Состояние", async (ctx) => {
            const config = await getConfig("internal.json");

            ctx.reply(config.state);
        });

        this.telegraf.hears("Настройки", async (ctx) => {
            const config = await getConfig("config.json");

            ctx.reply(
                `последние изменение: ${new Date(
                    config.settingsLastChangeDate
                )}\nдата разблокировки настроек: ${new Date(
                    config.settingsLastChangeDate + config.settingsLock
                )}\nbinance api key: ${
                    config.binanceApiKey
                }\nbinance secret key: ${
                    config.binanceSecretKey
                }\nдопустимая просадка: ${config.maxLoss.toFixed(
                    4
                )}%\nвремя блокировки трейдинга: ${(
                    config.tradingLock /
                    (1000 * 60 * 60)
                ).toFixed(4)} часов\nвремя блокировки изменения настроек: ${(
                    config.settingsLock /
                    (1000 * 60 * 60)
                ).toFixed(4)} часов`,
                config.settingsLastChangeDate + config.settingsLock < Date.now()
                    ? Markup.inlineKeyboard([
                          [
                              Markup.button.callback(
                                  "Изменить",
                                  "changeSettings"
                              ),
                          ],
                      ])
                    : undefined
            );
        });

        this.telegraf.action("changeSettings", async (ctx) => {
            await ctx.answerCbQuery();
            ctx.scene.enter("setSettingsScene");
        });

        this.telegraf.launch();

        this.telegraf.catch(e => console.log(e));
    }
};
