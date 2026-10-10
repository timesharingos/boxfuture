console.log('Testing electron import in different contexts...');
console.log('process.versions.electron:', process.versions.electron);
console.log('process.type:', process.type);

const electron = require('electron');
console.log('typeof electron:', typeof electron);
console.log('electron:', electron);

if (typeof electron === 'object' && electron.app) {
  console.log('SUCCESS: electron.app exists');
  electron.app.whenReady().then(() => {
    console.log('App ready!');
    electron.app.quit();
  });
} else {
  console.log('FAIL: electron is not an object or has no app property');
  process.exit(1);
}
