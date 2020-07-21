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
    const [ command, ...args ] = message.trim().substring(config.prefix.length).split(" ");

    log.info(`${command} was run by ${user.username}.`)

    let dbCommand = (await r.table('commands').get(command).run(client.dbConn));
    if (dbCommand) {
        client.say(channel, dbCommand.response.replace('<user>', user.username))
    }
}

app.set('view engine', 'ejs');
app.use('/static', express.static('static'));
app.use(express.urlencoded());
app.use(express.json());
app.use(flash());
app.use(session({
    secret: 'gamer time',
    cookie: {
        maxAge: 60000
    }
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

    if (command) {
        req.flash('error', 'A command with the same name already exists.');
        res.redirect('/');
        return;
    }

    r.table('commands').insert({
        id: req.body.commandName,
        response: req.body.commandResponse
    }).run(client.dbConn, (err) => {
        if (err) {
            req.flash('error', 'An error occured while adding the command to the database. Maybe it\'s a duplicate? This has been logged.');
            log.error(err);
        }
        res.redirect('/');
    })
})

app.listen(config.web.port, () => {
    log.success(`Listening on port ${config.web.port}.`);
})