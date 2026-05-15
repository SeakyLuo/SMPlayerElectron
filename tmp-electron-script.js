
const { app, net } = require('electron');
app.whenReady().then(async () => {
  try {
    const url = 'file:///C:/Users/luoki/AppData/Local/Packages/23778SeakyTheLoner.SMPlayer_jr81xyqy8yr5w/LocalState/cover-cache/2bc333103be95c7e0ddb4f63062a1289169854f8.jpg';
    const res = await net.fetch(url);
    console.log('fetch ok:', res.status, res.headers.get('content-type'), await res.arrayBuffer().then(b => b.byteLength));
  } catch (e) {
    console.error('fetch error:', e);
  }
  app.quit();
});

