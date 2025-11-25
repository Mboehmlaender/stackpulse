const express = require('express');

module.exports = function containerRoutes(docker) {
  const router = express.Router();

  router.get('/containers', async (req, res, next) => {
    try {
      const containers = await docker.listContainers({ all: true });
      const payload = containers.map((container) => ({
        id: container.Id,
        name: Array.isArray(container.Names) && container.Names.length > 0
          ? container.Names[0].replace(/^\//, '')
          : null,
        status: container.Status,
        image: container.Image,
        ports: container.Ports,
        labels: container.Labels,
      }));

      res.json(payload);
    } catch (err) {
      next(err);
    }
  });

  router.get('/stacks', async (req, res, next) => {
    try {
      const containers = await docker.listContainers({ all: true });

      const stacks = containers.reduce((acc, container) => {
        const composeProject = container.Labels?.['com.docker.compose.project'];
        const swarmStack = container.Labels?.['com.docker.stack.namespace'];
        const stackName = composeProject || swarmStack || 'unassigned';

        if (!acc[stackName]) {
          acc[stackName] = [];
        }

        acc[stackName].push({
          id: container.Id,
          name: Array.isArray(container.Names) && container.Names.length > 0
            ? container.Names[0].replace(/^\//, '')
            : null,
          status: container.Status,
          image: container.Image,
          ports: container.Ports,
          labels: container.Labels,
        });

        return acc;
      }, {});

      const payload = Object.entries(stacks).map(([name, stackContainers]) => ({
        name,
        containers: stackContainers,
      }));

      res.json(payload);
    } catch (err) {
      next(err);
    }
  });

  router.get('/container/:id', async (req, res, next) => {
    try {
      const container = docker.getContainer(req.params.id);
      const inspect = await container.inspect();

      res.json(inspect);
    } catch (err) {
      next(err);
    }
  });

  return router;
};
