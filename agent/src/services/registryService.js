const DEFAULT_REGISTRY = 'dockerhub';
const GHCR_HOST = 'ghcr.io';
const DOCKERHUB_HOST = 'registry-1.docker.io';
const ACCEPT_HEADERS = [
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json'
];

function createError(status, code, message) {
  const err = new Error(message || code);
  err.status = status;
  err.code = code;
  return err;
}

function detectRegistry(imageName = '') {
  if (imageName.startsWith(`${GHCR_HOST}/`)) return 'ghcr';
  if (!imageName.includes('/')) return 'dockerhub';
  return 'generic';
}

function splitImageIntoComponents(imageName) {
  if (!imageName) throw createError(400, 'invalid_image', 'Image name required');

  const registryType = detectRegistry(imageName);
  let registryHost;
  let remainder = imageName;

  if (registryType === 'ghcr') {
    registryHost = GHCR_HOST;
    remainder = imageName.replace(`${GHCR_HOST}/`, '');
  } else if (registryType === 'dockerhub') {
    registryHost = DOCKERHUB_HOST;
    if (!imageName.includes('/')) {
      remainder = `library/${imageName}`;
    } else if (imageName.startsWith('docker.io/')) {
      remainder = imageName.replace('docker.io/', '');
    } else if (imageName.startsWith(`${DOCKERHUB_HOST}/`)) {
      remainder = imageName.replace(`${DOCKERHUB_HOST}/`, '');
    }
  } else {
    const firstSlash = imageName.indexOf('/');
    registryHost = imageName.slice(0, firstSlash);
    remainder = imageName.slice(firstSlash + 1);
  }

  const digestIndex = remainder.indexOf('@');
  let repoPart = remainder;
  let digest = null;
  if (digestIndex !== -1) {
    repoPart = remainder.slice(0, digestIndex);
    digest = remainder.slice(digestIndex + 1);
  }

  const lastColon = repoPart.lastIndexOf(':');
  let tag = 'latest';
  let repository = repoPart;
  if (lastColon > -1 && repoPart.indexOf('/') < lastColon) {
    tag = repoPart.slice(lastColon + 1);
    repository = repoPart.slice(0, lastColon);
  }

  return {
    registryType,
    registryHost,
    repository,
    tag,
    digest,
    fullImage: imageName
  };
}

async function getLocalImageInfo(docker, imageName, preferredTag = null) {
  try {
    const image = docker.getImage(imageName);
    const inspect = await image.inspect();
    const repoTags = inspect?.RepoTags || [];
    const repoDigests = inspect?.RepoDigests || [];

    let localTagFull = repoTags.length ? repoTags[0] : null;
    let localDigestFull = repoDigests.length ? repoDigests[0] : null;

    // Fallback: search listImages for matching repoTag when digest is missing
    if (!localDigestFull) {
      const images = await docker.listImages();
      const matchByTag = images.find((img) => (img.RepoTags || []).includes(imageName));
      const normalizedRepo = imageName.includes(':') ? imageName.split(':')[0] : imageName;
      const matchByRepo = images.find((img) => (img.RepoTags || []).some((t) => t.startsWith(`${normalizedRepo}:`)));
      const candidate = matchByTag || matchByRepo;
      if (candidate) {
        localDigestFull = (candidate.RepoDigests || [])[0] || null;
        localTagFull = (candidate.RepoTags || [])[0] || localTagFull;
      }
    }

    let localTag = preferredTag || null;
    if (!localTag) {
      localTag = localTagFull && localTagFull.includes(':')
        ? localTagFull.split(':').pop()
        : null;
    }
    const localDigestHash = localDigestFull && localDigestFull.includes('@')
      ? localDigestFull.split('@')[1]
      : localDigestFull;

    return { localTag, localDigestFull, localDigestHash };
  } catch (err) {
    throw createError(404, 'image_not_found', `Local image not found: ${imageName}`);
  }
}

function buildBasicAuthHeader() {
  const username = process.env.REGISTRY_USERNAME || process.env.GITHUB_USERNAME;
  const password = process.env.REGISTRY_PASSWORD || process.env.GITHUB_TOKEN || process.env.GITHUB_PAT;
  if (!username || !password) return {};
  const base = Buffer.from(`${username}:${password}`, 'utf8').toString('base64');
  return { Authorization: `Basic ${base}` };
}

function buildBearerHeader() {
  const token = process.env.REGISTRY_TOKEN;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

async function fetchRemoteManifest(registryHost, repository, reference, headers) {
  const url = `https://${registryHost}/v2/${repository}/manifests/${reference}`;
  const res = await fetch(url, { headers });
  const body = await res.text();
  return { res, body };
}

async function fetchRegistryTokenDockerHub(repository) {
  const headers = {
    Accept: ACCEPT_HEADERS.join(', '),
    ...buildBearerHeader(),
    ...buildBasicAuthHeader(),
  };

  const url = `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repository}:pull`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw createError(res.status === 401 ? 403 : res.status, 'token_error', `Failed to fetch Docker Hub token: ${res.status} ${body || ''}`.trim());
  }

  const data = await res.json();
  if (!data.token) {
    throw createError(403, 'token_error', 'Token missing in Docker Hub response');
  }
  return data.token;
}

async function fetchAnonymousTokenDockerHub(repository) {
  const headers = {
    Accept: ACCEPT_HEADERS.join(', ')
  };
  const url = `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repository}:pull`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw createError(res.status === 401 ? 403 : res.status, 'token_error', `Failed to fetch Docker Hub token anonymously: ${res.status} ${body || ''}`.trim());
  }
  const data = await res.json();
  if (!data.token) {
    throw createError(403, 'token_error', 'Token missing in Docker Hub anonymous response');
  }
  return data.token;
}

async function resolveRemoteDigestDockerHub(repository, tag, localDigestHash) {
  const accept = { Accept: ACCEPT_HEADERS.join(', ') };
  let token;
  try {
    token = await fetchRegistryTokenDockerHub(repository);
  } catch {
    token = null;
  }
  let headers = token ? { ...accept, Authorization: `Bearer ${token}` } : { ...accept };

  let { res, body } = await fetchRemoteManifest(DOCKERHUB_HOST, repository, tag, headers);
  if (res.status === 404 && localDigestHash) {
    ({ res, body } = await fetchRemoteManifest(DOCKERHUB_HOST, repository, localDigestHash, headers));
  }

  if ((res.status === 401 || res.status === 403) && !token) {
    try {
      const anonToken = await fetchAnonymousTokenDockerHub(repository);
      headers = { ...accept, Authorization: `Bearer ${anonToken}` };
      ({ res, body } = await fetchRemoteManifest(DOCKERHUB_HOST, repository, tag, headers));
      if (res.status === 404 && localDigestHash) {
        ({ res, body } = await fetchRemoteManifest(DOCKERHUB_HOST, repository, localDigestHash, headers));
      }
    } catch {
      // fall through
    }
  }

  if (!res.ok) {
    if (res.status === 404) throw createError(404, 'tag_not_found', 'Tag not found on registry');
    if (res.status === 401 || res.status === 403) throw createError(403, 'auth_required', body || 'Unauthorized');
    throw createError(502, 'registry_error', `Registry responded with ${res.status} ${body || ''}`.trim());
  }

  const digest = extractDigestFromManifest(body);
  if (!digest) throw createError(500, 'digest_missing', 'Could not extract digest from manifest');
  return digest;
}

async function resolveRemoteDigestGeneric(registryHost, repository, tag, localDigestHash) {
  const accept = { Accept: ACCEPT_HEADERS.join(', ') };
  const headers = {
    ...accept,
    ...buildBearerHeader(),
    ...buildBasicAuthHeader(),
  };

  let { res, body } = await fetchRemoteManifest(registryHost, repository, tag, headers);
  if (res.status === 404 && localDigestHash) {
    ({ res, body } = await fetchRemoteManifest(registryHost, repository, localDigestHash, headers));
  }

  if (!res.ok) {
    if (res.status === 404) throw createError(404, 'tag_not_found', 'Tag not found on registry');
    if (res.status === 401 || res.status === 403) throw createError(403, 'auth_required', body || 'Unauthorized');
    throw createError(502, 'registry_error', `Registry responded with ${res.status} ${body || ''}`.trim());
  }

  const digest = extractDigestFromManifest(body);
  if (!digest) throw createError(500, 'digest_missing', 'Could not extract digest from manifest');
  return digest;
}

async function resolveRemoteDigest(registryType, registryHost, repository, tag, localDigestHash) {
  const fetchDigestViaBuildx = async (ref) => {
    const { execFile } = require('child_process');
    return new Promise((resolve, reject) => {
      execFile('docker', ['buildx', 'imagetools', 'inspect', ref], { maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          const msg = stderr || err.message || 'docker buildx imagetools inspect failed';
          return reject(createError(502, 'registry_error', msg.trim()));
        }
        const match = stdout.match(/Digest:\s*(sha256:[a-fA-F0-9]+)/);
        if (match && match[1]) {
          return resolve(match[1]);
        }
        return reject(createError(500, 'digest_missing', 'Could not extract digest from imagetools inspect'));
      });
    });
  };

  const fetchRemoteDigestViaDocker = async (ref) => {
    const { execFile } = require('child_process');
    return new Promise((resolve, reject) => {
      execFile('docker', ['manifest', 'inspect', ref], { maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          const msg = stderr || err.message || 'docker manifest inspect failed';
          return reject(createError(502, 'registry_error', msg.trim()));

        }
        try {
          const json = JSON.parse(stdout);
          if (Array.isArray(json.manifests) && json.manifests.length > 0) {
            const candidate = json.manifests[0];
            if (candidate?.digest) {
              return resolve(candidate.digest);
            }
          }
          if (json?.config?.digest) {
            return resolve(json.config.digest);
          }
          if (Array.isArray(json?.layers) && json.layers.length > 0 && json.layers[0].digest) {
            return resolve(json.layers[0].digest);
          }
        } catch {
          // fall through to error
        }
        return reject(createError(500, 'digest_missing', 'Could not extract digest from docker manifest inspect'));
      });
    });
  };

  if (registryType === 'ghcr') {
    // Use docker buildx imagetools inspect for GHCR: tag first, then digest fallback
    const host = registryHost || GHCR_HOST;
    try {
      const digest = await fetchDigestViaBuildx(`${host}/${repository}:${tag}`);
      return digest;
    } catch (err) {
      if (localDigestHash) {
        return fetchDigestViaBuildx(`${host}/${repository}@${localDigestHash}`);
      }
      throw err.code ? err : createError(502, 'registry_error', err.message || 'GHCR lookup failed');
    }
  }
  if (registryType === 'dockerhub') {
    const host = 'docker.io';
    try {
      return await fetchDigestViaBuildx(`${host}/${repository}:${tag}`);
    } catch (err) {
      if (localDigestHash) {
        try {
          return await fetchDigestViaBuildx(`${host}/${repository}@${localDigestHash}`);
        } catch {
          // fall through
        }
      }
    }
    // Fallback to manifest inspect/HTTP if buildx fails
    try {
      return await fetchRemoteDigestViaDocker(`${host}/${repository}:${tag}`);
    } catch (err) {
      if (localDigestHash) {
        try {
          return await fetchRemoteDigestViaDocker(`${host}/${repository}@${localDigestHash}`);
        } catch {
          // fall through
        }
      }
    }
    return resolveRemoteDigestDockerHub(repository, tag, localDigestHash);
  }
  // generic
  try {
    return await fetchDigestViaBuildx(`${registryHost}/${repository}:${tag}`);
  } catch (err) {
    if (localDigestHash) {
      try {
        return await fetchDigestViaBuildx(`${registryHost}/${repository}@${localDigestHash}`);
      } catch {
        // fall through
      }
    }
  }
  // fallback manifest path
  try {
    return await fetchRemoteDigestViaDocker(`${registryHost}/${repository}:${tag}`);
  } catch (err) {
    if (localDigestHash) {
      try {
        return await fetchRemoteDigestViaDocker(`${registryHost}/${repository}@${localDigestHash}`);
      } catch {
        // fall through to HTTP
      }
    }
  }
  return resolveRemoteDigestGeneric(registryHost, repository, tag, localDigestHash);
}

async function checkImageUpdate(docker, imageName) {
  const { registryType, registryHost, repository, tag } = splitImageIntoComponents(imageName);
  const { localTag, localDigestHash } = await getLocalImageInfo(docker, imageName, tag);

  const remoteDigest = await resolveRemoteDigest(registryType, registryHost, repository, tag, localDigestHash);

  return {
    image: imageName,
    localTag,
    localDigest: localDigestHash,
    remoteDigest,
    updateAvailable: Boolean(localDigestHash && remoteDigest && localDigestHash !== remoteDigest)
  };
}

module.exports = {
  detectRegistry,
  splitImageIntoComponents,
  getLocalImageInfo,
  checkImageUpdate,
  resolveRemoteDigestDockerHub,
  resolveRemoteDigestGeneric
};
