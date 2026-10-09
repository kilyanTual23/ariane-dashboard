module.exports = {
  apps: [
    {
      name: "ariane",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      cwd: "./",
      instances: 1,
      autorestart: true, // Relance automatique en cas de crash
      watch: false,
      max_memory_restart: "1G", // Redémarre si l'app dépasse 1 Go de RAM
      exp_backoff_restart_delay: 100, // Temporisation progressive si plantages en chaîne
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      time: true, // Affiche la date et l'heure dans les logs PM2
    },
  ],
};

