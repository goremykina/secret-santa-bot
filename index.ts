import { Bot, CallbackQueryContext, CommandContext, Context, InlineKeyboard } from 'grammy';
import { funAnimalName } from 'fun-animal-names'
import * as db from './db';
import { chunk, random, toMap, shuffle } from "./array-kung-fu";

if (!process.env.TELEGRAM_TOKEN) {
    console.error('TELEGRAM_TOKEN is not set');
    process.exit(1);
}

if (!process.env.ADMIN_CHAT_ID || isNaN(Number(process.env.ADMIN_CHAT_ID))) {
    console.error('ADMIN_CHAT_ID is not set or not a number');
    process.exit(1);
}

const bot = new Bot(process.env.TELEGRAM_TOKEN);
const adminChatId = Number(process.env.ADMIN_CHAT_ID);

const allUsers = db.get();
let chatIdToUser = toMap(allUsers, user => user.chatId);

const save = () => {
    db.save(allUsers);
    refreshMap();
};

const refreshMap = () => {
    chatIdToUser = toMap(allUsers, user => user.chatId);
};

const notifyAdmin = async (message: string) => {
    await bot.api.sendMessage(adminChatId, message);
};

const adminFilter = (action: (ctx: CommandContext<Context>) => Promise<void>) => {
    return async (ctx: CommandContext<Context>) => {
        if (ctx.chat.id != adminChatId) {
            await ctx.replyWithAudio('CQACAgIAAxkBAAPHZWjo5lylUeAJ01B_-gp-UVhwv4gAAkVIAAL3qklL1xDkY--VmFEzBA');

            const chatId = ctx.chat.id && ctx.chat.id.toString();
            const userName = chatId && chatIdToUser.has(chatId) ? chatIdToUser.get(chatId)!.name : 'Unknown';
            await notifyAdmin(`User ${ctx.chat.id} (${userName}) tried an admin action`);
            return;
        }

        await action(ctx);
    };
};

const start = async (ctx: CommandContext<Context>) => await ctx.reply('Please enter your name');

const list = async (ctx: CommandContext<Context>) => {
    const idsToSkip = new Set<string>();
    const pairs: string[][] = [];

    allUsers.forEach(user => {
        if (idsToSkip.has(user.chatId)) {
            return;
        }

        const pair: string[] = [user.name];
        const partner = !user.partnerChatId
            ? null
            : allUsers.find(u => u.chatId === user.partnerChatId);
        if (partner) {
            pair.push(partner.name);
            idsToSkip.add(partner.chatId);
        }

        pairs.push(pair);
    });

    const reply = pairs.map(pair => pair.length > 1 ? pair.join(' ❤️ ') : pair[0]).join('\n');
    await ctx.reply(reply || 'There are no participants yet');

    const chatId = ctx.chat.id && ctx.chat.id.toString();
    const userName = chatId && chatIdToUser.has(chatId) ? chatIdToUser.get(chatId)!.name : 'Unknown';
    await notifyAdmin(`User ${ctx.chat.id} (${userName}) looked at the list of participants`);
};

const test = async (ctx: CommandContext<Context>) => {
    if (allUsers.some(user => !user.secretSantaForChatId)) {
        await ctx.reply('The draw has not started yet.');
        return;
    }

    const anonimizedUsers = shuffle(allUsers)
        .map(user => ({
            chatId: user.chatId,
            secretSantaFor: user.secretSantaForChatId!,
            sillyName: funAnimalName(Math.random().toString()) }));
    const anonimizedUsersMap = toMap(anonimizedUsers, u => u.chatId);

    const reply = anonimizedUsers
        .map(user => `${user.sillyName} 🎁 ${anonimizedUsersMap.get(user.secretSantaFor)!.sillyName}`)
        .join('\n');
    await ctx.reply(reply);

    const chatId = ctx.chat.id && ctx.chat.id.toString();
    const userName = chatId && chatIdToUser.has(chatId) ? chatIdToUser.get(chatId)!.name : 'Unknown';
    await notifyAdmin(`User ${ctx.chat.id} (${userName}) looked at anonymous drawing results`);
};

const startPartnerSelection = async (_: CommandContext<Context>) => {
    const notifyPromises = allUsers
        .map(async targetUser => {
            const personalizedUserList = allUsers.filter(user => user.chatId !== targetUser.chatId);
            const keyboardRows = chunk(personalizedUserList, 3)
                .map(usersChunk =>
                    usersChunk.map(user => InlineKeyboard.text(user.name, `select-partner-${user.chatId}`)));
            const inlineKeyboard = InlineKeyboard.from(keyboardRows);

            await bot.api.sendMessage(targetUser.chatId, 'Please select your partner', {
                reply_markup: inlineKeyboard
            })
        });

    await Promise.all(notifyPromises);
};

const startDraw = async (ctx: CommandContext<Context>) => {
    if (allUsers.length % 2 !== 0 || allUsers.length < 3) {
        await ctx.reply('There must be an even number (> 2) of players');
        return;
    }

    const secretSantaToUser = new Map<string, string>();
    const reservedUserChatIds = new Set<string>();

    for (const user of allUsers) {
        const availableUsers = allUsers.filter(u => !reservedUserChatIds.has(u.chatId) &&
            u.chatId !== user.chatId && u.chatId !== user.partnerChatId);

        if (!availableUsers.length) {
            await ctx.reply('The draw is impossible');
            return;
        }

        const santaFor = random(availableUsers);
        secretSantaToUser.set(user.chatId, santaFor.chatId);

        reservedUserChatIds.add(santaFor.chatId);
    }

    for (const user of allUsers) {
        user.secretSantaForChatId = secretSantaToUser.get(user.chatId);
    }

    save();

    const notifyPromises = allUsers.map(async user => {
        const santaFor = chatIdToUser.get(user.secretSantaForChatId!)!;
        return bot.api.sendMessage(user.chatId, `You are ${santaFor.name}'s secret Santa`)
    });
    await Promise.all(notifyPromises);
};

const reset = async (ctx: CommandContext<Context>) => {
    for (const user of allUsers) {
        delete user.secretSantaForChatId;
    }

    save();

    await ctx.reply('Done');
};

const selectPartner = async (ctx: CallbackQueryContext<Context>) => {
    if (!ctx.chat) {
        await bot.api.sendMessage(adminChatId, 'User without chat id has just tried to select a partner.');
        return;
    }

    const chatId = ctx.chat.id.toString();
    const selectedPartnerChatId = ctx.match[1];
    const selectedUser = chatIdToUser.get(selectedPartnerChatId);
    const currentUser = chatIdToUser.get(chatId);

    if (!currentUser || !selectedUser) {
        await ctx.answerCallbackQuery({
            text: "User not found. Please try /start again."
        });
        return;
    }

    currentUser.partnerChatId = selectedUser.chatId;
    selectedUser.partnerChatId = currentUser.chatId;

    save();

    await ctx.answerCallbackQuery({
        text: "Saved"
    });


    const userName = chatIdToUser.has(chatId) ? chatIdToUser.get(chatId)!.name : 'Unknown';
    await notifyAdmin(`User ${ctx.chat.id} (${userName}) selected a partner`);
};

bot.command('start', start);
bot.command('list', list);
bot.command('test', test);
bot.command('start_partner_selection', adminFilter(startPartnerSelection));
bot.command('start_the_draw', adminFilter(startDraw));
bot.command('reset', adminFilter(reset));

bot.callbackQuery(/select-partner-([0-9]+)/, selectPartner);

// Handle other messages.
bot.on('message', async (ctx) => {
    console.log(`Message from ${ctx.chat.id}: ${ctx.message.text}`);

    const name = ctx.message.text?.trim();
    if (!name) {
        await ctx.reply(`Is it so difficult to write a name? 🤬`);
        return;
    }

    if (name.length < 2) {
        await ctx.reply(`Name is too short. Please provide at least 2 characters.`);
        return;
    }

    if (name.length > 50) {
        await ctx.reply(`Name is too long. Please keep it under 50 characters.`);
        return;
    }

    const chatId = ctx.chat.id.toString();
    const existingUserWithName = allUsers.find(u => u.name.toLowerCase() === name.toLowerCase() && u.chatId !== chatId);

    if (existingUserWithName) {
        await ctx.reply(`The name "${name}" is already taken by another participant. Please choose a different name.`);
        return;
    }

    const user = chatIdToUser.get(chatId);

    if (!user) {
        allUsers.push({
            name: name,
            chatId: chatId
        });
    } else {
        user.name = name;
    }

    save();

    await ctx.reply(`Thanks ${name}! Please wait for further instructions.\nIf you want to set a different name, just write it.`)

    const userName = chatIdToUser.get(chatId)!.name;
    await notifyAdmin(`User ${ctx.chat.id} set a new name (${userName})`);
});

await bot.api.setMyCommands([
    { command: 'list', description: 'List participants' },
    { command: 'test', description: 'View anonymous drawing results' },
    { command: 'start_partner_selection', description: 'Start partner selection (admin only)' },
    { command: 'start_the_draw', description: 'Start the draw (admin only)' },
]);

await bot.start();
