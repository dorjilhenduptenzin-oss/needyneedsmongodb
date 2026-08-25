import serverApp from '../server/index.js';

// Vercel Node serverless functions can call an Express `app` directly.
// Avoid `serverless-http` version issues by invoking the app function.
export default function (req, res) {
  return serverApp(req, res);
}
