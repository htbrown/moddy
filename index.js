const express = require('express'),
    tmi = require('tmi.js'),
    Journl = require('journl'),
    config = require('./config'),
    r = require('rethinkdb'),
    flash = require('connect-flash'),
    session = require('express-session');

const app = express();
const log = new Journl();

const client = new tmi.client(config.tmi);

r.connect({
    db: config.db.db,
    host: config.db.host,
    port: config.db.port
}, (err, conn) => {
    if (err) return log.error(`Error connecting to database: \n${err.stack}`);

    client.dbConn = conn;
    log.success('Connected to database.')
})


client.on('chat', onMessageHandler);
client.on('connected', (addr, port) => {
    log.success('Logged into Twitch.')
})

client.connect();

async function onMessageHandler (channel, user, message, self) {
    if (self) { return; }
  
    if (!message.startsWith(config.prefix)) return;
    let [ command, ...args ] = message.trim().substring(config.prefix.length).split(" ");

    let channelName = channel.split('');
    channelName.shift();
    channelName = channelName.join('');

    log.info(`${command} was run by ${user.username}.`)

    let dbCommand = (await r.table('commands').get(command).run(client.dbConn));

    if (dbCommand) {
        let response = dbCommand.response
            .replace('<user>', user.username);

        if (dbCommand.type == 'whisper') {
            client.whisper(user.username, response);
            client.say(channel, `${user.username}, Check your whispers.`)
        } else {
            client.say(channel, response);
        }

        return;
    }

    switch (command) {
        case 'ban':
            if (user.mod || user.username == channelName) {
                if (!args[0]) return client.say(channel, `${user.username}, You need to give me a user to ban.`);
                client.ban(channel, args[0], args[1])
                client.say(channel, `${user.username}, I have banned ${args[0]} from the channel.`);
                break;
            }
        case 'unban':
            if (user.mod || user.username == channelName) {
                if (!args[0]) return client.say(channel, `${user.username}, You need to give me a user to unban.`);
                client.unban(channel, args[0]);
                client.say(channel, `${user.username}, I have unbanned ${args[0]} from the channel.`);
                break;
            }
        case 'timeout':
            if (user.mod || user.username == channelName) {
                if (!args[0] || !args[1]) return client.say(channel, `${user.username}, You need to give me a user to timeout and a time in minutes.`);
                client.timeout(channel, args[0], args[1] * 60).catch(err => {
                    if (err) console.log(err);
                });
                client.say(channel, `${user.username}, I have timed out ${args[0]} for ${args[1]} minute(s).`);
                break;
            }
    }
}

app.set('view engine', 'ejs');
app.use('/static', express.static('static'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(flash());
app.use(session({
    secret: 'gamer time',
    cookie: {
        maxAge: 60000
    },
    resave: false,
    saveUninitialized: false
}));

app.get('/', async (req, res) => {
    let data = await (await r.table('commands').run(client.dbConn)).toArray();

    res.render('index', {
        data: data,
        error: req.flash('error')
    });
})

app.post('/api/create', async (req, res) => {
    let command = (await r.table('commands').get(req.body.commandName).run(client.dbConn));

    if (!req.body.commandName || !req.body.commandResponse) {
        req.flash('error', 'Incomplete request. All fields are required.');
        res.redirect('/');
        return;
    }

    if (req.body.commandName == 'ban' || req.body.commandName == 'timeout' || req.body.commandName == 'unban') {
        req.flash('error', `The command name ${req.body.commandName} is unavailable.`);
        res.redirect('/');
        return;
    }

    if (command) {
        req.flash('error', 'A command with the same name already exists.');
        res.redirect('/');
        return;
    }

    r.table('commands').insert({
        id: req.body.commandName,
        response: req.body.commandResponse,
        type: req.body.commandType.toLowerCase()
    }).run(client.dbConn, (err) => {
        if (err) {
            req.flash('error', 'An error occured while adding the command to the database. Maybe it\'s a duplicate? This has been logged.');
            log.error(err);
        }
        res.redirect('/');
    })
})

app.post('/api/delete', async (req, res) => {
    if (!req.body.commandName) {
        req.flash('error', 'No command was specified for deletion.');
        res.redirect('/');
        return;
    }

    let command = (await r.table('commands').get(req.body.commandName).run(client.dbConn));
    if (!command) {
        req.flash('error', 'The specified command wasn\'t found.');
        res.redirect('/');
        return;
    }

    r.table('commands').get(req.body.commandName).delete().run(client.dbConn, (err) => {
        if (err) {
            req.flash('error', 'An error occured while trying to delete that command. The error has been logged.');
            res.redirect('/');
            log.error(err);
            return;
        } else {
            res.redirect('/');
            return;
        }
    })
})

app.post('/api/edit', async (req, res) => {
    if (!req.body.commandName || !req.body.commandResponse) {
        req.flash('error', 'All fields are required.');
        res.redirect('/');
        return;
    }

    let command = (await r.table('commands').get(req.body.commandName).run(client.dbConn));
    if (!command) {
        req.flash('error', 'The specified command wasn\'t found.');
        res.redirect('/');
        return;
    }

    r.table('commands').get(req.body.commandName).update({
        response: req.body.commandResponse,
        type: req.body.commandType.toLowerCase()
    }).run(client.dbConn, (err) => {
        if (err) {
            req.flash('error', 'An error occured while trying to edit that command. The error has been logged.');
            res.redirect('/');
            log.error(err);
            return;
        } else {
            res.redirect('/');
            return;
        }
    })
})

app.listen(config.web.port, () => {
    log.success(`Listening on port ${config.web.port}.`);
})