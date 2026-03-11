module.exports = {
  apps: [
    {
      name: 'werewolf-dev',
      script: 'npm',
      args: 'run dev',
      watch: false, // nodemon handles file watching and rebuilding
      autorestart: false, // nodemon manages its own restarts; pm2 should not interfere
      env: {
        NODE_ENV: 'development',
      },
    },
  ],
};
