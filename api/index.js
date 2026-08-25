import serverApp from '../server/index.js';
import serverless from 'serverless-http';

const handler = serverless(serverApp);

export default async function (req, res) {
  return handler(req, res);
}
