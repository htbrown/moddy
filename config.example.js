module.exports = {
    tmi: {
        identity: {
            username: 'BOT_USERNAME',
            password: 'OAUTH_TOKEN'
        },
        channels: [
            'CHANNEL_NAME'
        ]
    },
    web: {
        port: 4000
    },
    prefix: '!',
    db: {
        port: 28015,
        host: 'localhost',
        db: 'twitch'
    }
}