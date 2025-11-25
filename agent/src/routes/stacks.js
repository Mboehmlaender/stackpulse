const express = require('express');
const { checkImageUpdate, getLocalImageInfo } = require('../services/registryService');

async function getComposeStacks(docker) {
  const containers = await docker.listContainers({ all: true });
  const stacks = containers.reduce((acc, container) => {
    const composeProject = container.Labels?.['com.docker.compose.project'];
    if (!composeProject) return acc;

    if (!acc[composeProject]) {
      acc[composeProject] = {
        name: composeProject,
        type: 'compose',
        images: new Map(),
      };
    }

    acc[composeProject].images.set(container.Image, {
      source: 'container',
      name: container.Image
    });

    return acc;
  }, {});

  return Object.values(stacks);
}

async function getSwarmStacks(docker) {
  try {
    const services = await docker.listServices();
    const stacks = services.reduce((acc, service) => {
      const stackNs = service.Spec?.Labels?.['com.docker.stack.namespace'];
      if (!stackNs) return acc;

      if (!acc[stackNs]) {
        acc[stackNs] = {
          name: stackNs,
          type: 'swarm',
          images: new Map(),
        };
      }

      const image = service.Spec?.TaskTemplate?.ContainerSpec?.Image;
      if (image) {
        acc[stackNs].images.set(image, {
          source: service.Spec?.Name || 'service',
          name: image
        });
      }

      return acc;
    }, {});

    return Object.values(stacks);
  } catch (err) {
    // Not a swarm or no permissions; just return empty
    if (err.statusCode === 503 || /This node is not a swarm manager/i.test(err.message || '')) {
      return [];
    }
    throw err;
  }
}

async function enrichImagesWithDigests(docker, imageEntries) {
  return Promise.all(imageEntries.map(async (entry) => {
    try {
      return await checkImageUpdate(docker, entry.name);
    } catch (err) {
      const status = err.status || 500;
      return {
        ...entry,
        localDigest: null,
        remoteDigest: null,
        updateAvailable: false,
        error: err.code || err.message || `update_check_failed_${status}`
      };
    }
  }));
}

module.exports = function stackRoutes(docker) {
  const router = express.Router();

  router.get('/stack-images', async (req, res, next) => {
    const withChecks = req.query.checkUpdates === 'true';

    try {
      const [composeStacks, swarmStacks] = await Promise.all([
        getComposeStacks(docker),
        getSwarmStacks(docker)
      ]);

      const combined = [...composeStacks, ...swarmStacks];

      const result = await Promise.all(combined.map(async (stack) => {
        const images = Array.from(stack.images.values());
        if (!withChecks) {
          return { name: stack.name, type: stack.type, images };
        }

        const enriched = await enrichImagesWithDigests(docker, images);
        return { name: stack.name, type: stack.type, images: enriched };
      }));

      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // Always return local/remote digests with error details when resolution fails
  router.get('/stack-images/status', async (req, res, next) => {
    try {
      const [composeStacks, swarmStacks] = await Promise.all([
        getComposeStacks(docker),
        getSwarmStacks(docker)
      ]);

      const combined = [...composeStacks, ...swarmStacks];

      const result = await Promise.all(combined.map(async (stack) => {
        const images = Array.from(stack.images.values());
        const enriched = await enrichImagesWithDigests(docker, images);
        return { name: stack.name, type: stack.type, images: enriched };
      }));

      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
};
