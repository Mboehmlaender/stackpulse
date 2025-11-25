const express = require('express');
const os = require('os');

module.exports = function infoRoutes(docker) {
  const router = express.Router();

  router.get('/info', async (req, res, next) => {
    try {
      const [dockerVersion, containers, images] = await Promise.all([
        docker.version(),
        docker.listContainers({ all: true }),
        docker.listImages(),
      ]);

      res.json({
        dockerVersion: dockerVersion.Version,
        hostname: os.hostname(),
        uptime: os.uptime(),
        platform: os.platform(),
        containerCount: containers.length,
        imageCount: images.length,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/events', (req, res) => {
    res.json({ message: 'Events endpoint not implemented yet' });
  });

  return router;
};
