const express = require('express');
const { checkImageUpdate, getLocalImageInfo } = require('../services/registryService');

module.exports = function imageRoutes(docker) {
  const router = express.Router();

  router.get('/images', async (req, res, next) => {
    try {
      const images = await docker.listImages();
      const payload = images.map((image) => ({
        repoTags: image.RepoTags || [],
        size: image.Size,
        id: image.Id,
        created: image.Created,
      }));

      res.json(payload);
    } catch (err) {
      next(err);
    }
  });

  // Accept full image name with slashes/colons: /image/check/<image> (URL-encoded)
  router.get('/image/check/*', async (req, res) => {
    const raw = req.params[0] || req.params.name || '';
    if (!raw) {
      return res.status(400).json({ error: 'invalid_image' });
    }
    const imageName = decodeURIComponent(raw);

    try {
      const result = await checkImageUpdate(docker, imageName);
      res.json(result);
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.code || err.message || 'Internal error' });
    }
  });

  return router;
};
