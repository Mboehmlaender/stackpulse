const express = require('express');
const { checkImageUpdate } = require('../services/registryService');

function extractTag(imageName) {
  const parts = imageName.split(':');
  return parts.length > 1 ? parts[parts.length - 1] : 'latest';
}

function pickPortainerContainer(containers) {
  return containers.find((container) => {
    const labels = container.Labels || {};
    if (labels['io.portainer.container']) return true;
    const image = container.Image || '';
    return /portainer/i.test(image);
  });
}

async function getPortainerVersionInfo(docker) {
  const containers = await docker.listContainers({ all: true });
  const portainer = pickPortainerContainer(containers);
  if (!portainer) {
    return null;
  }

  const imageName = portainer.Image;
  const tag = extractTag(imageName);
  let version = null;
  let localDigest = null;
  let remoteDigest = null;
  let updateAvailable = false;

  try {
    const inspect = await docker.getImage(imageName).inspect();
    const labels = inspect?.Config?.Labels || {};
    version = labels['org.opencontainers.image.version'] || labels.version || tag;
    const repoDigests = inspect?.RepoDigests || [];
    localDigest = repoDigests.length ? repoDigests[0].split('@')[1] || repoDigests[0] : null;
  } catch {
    version = tag;
    localDigest = null;
  }

  try {
    const info = await checkImageUpdate(docker, imageName);
    remoteDigest = info.remoteDigest;
    localDigest = info.localDigest || localDigest;
    updateAvailable = info.updateAvailable;
  } catch {
    remoteDigest = null;
    updateAvailable = false;
  }

  return {
    containerId: portainer.Id,
    image: imageName,
    tag,
    version,
    localDigest,
    remoteDigest,
    updateAvailable
  };
}

module.exports = function portainerVersionRoutes(docker) {
  const router = express.Router();

  router.get('/portainer/version', async (req, res, next) => {
    try {
      const info = await getPortainerVersionInfo(docker);
      if (!info) {
        return res.status(404).json({ error: 'Portainer container not found' });
      }
      res.json(info);
    } catch (err) {
      next(err);
    }
  });

  return router;
};
