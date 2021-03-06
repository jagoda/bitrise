const abortBuild = async ({ appSlug, buildSlug, client }, options = {}) => {
  if (options.reason) {
    await client.post(`/apps/${appSlug}/builds/${buildSlug}/abort`, { abort_reason: options.reason });
    return;
  }

  await client.post(`/apps/${appSlug}/builds/${buildSlug}/abort`);
};

const describeBuild = async ({ appSlug, buildSlug, client }) => {
  const response = await client.get(`/apps/${appSlug}/builds/${buildSlug}`);
  return response.data.data;
};

const followBuild = async ({ appSlug, buildSlug, client }, options = {}) => {
  let lastActive = Date.now();
  let timestamp;

  do {
    if (timestamp) {
      await sleep(options.interval || 5000);
    }

    const parameters = timestamp ? `?timestamp=${timestamp}` : '';
    const response = await client.get(`/apps/${appSlug}/builds/${buildSlug}/log${parameters}`);

    // If the log has already been archived then polling is no good. Just
    // download and print the log data.
    if (response.data.is_archived && !timestamp) {
      const archiveResponse = await client.get(response.data.expiring_raw_log_url);
      process.stdout.write(archiveResponse.data);
      break;
    }

    const now = Date.now();
    if (response.data.log_chunks.length) {
      response.data.log_chunks.forEach(({ chunk }) => process.stdout.write(chunk));
      lastActive = now;
    } else if (options.heartbeat && (now - lastActive) >= options.heartbeat) {
      process.stdout.write('heartbeat: waiting for build output...\n');
      lastActive = now;
    }

    timestamp = response.data.timestamp;
  } while (timestamp);

  const attributes = await describeBuild({ appSlug, buildSlug, client });

  if (attributes.status > 1) {
    throw new Error(`Build ${appSlug}/${buildSlug} failed`);
  }
};

const isFinished = async ({ appSlug, buildSlug, client }) => {
  const attributes = await describeBuild({ appSlug, buildSlug, client });
  return !!attributes.finished_at;
};

const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay));

module.exports = ({ appSlug, buildSlug, client }) => {
  const build = { appSlug, buildSlug };
  const state = { appSlug, buildSlug, client };

  build.abort = abortBuild.bind(build, state);
  build.describe = describeBuild.bind(build, state);
  build.follow = followBuild.bind(build, state);
  build.isFinished = isFinished.bind(build, state);

  return build;
};
