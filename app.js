// Copyright 2016 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';

// used to ssh into Compute Engine
var path, node_ssh, ssh

const process = require('process'); // Required to mock environment variables
process.env.GCLOUD_STORAGE_BUCKET = 'tugbucket1234';

node_ssh = require('node-ssh')
ssh = new node_ssh()

// [START gae_storage_app]
const {format} = require('util');
const express = require('express');
const Multer = require('multer');
const bodyParser = require('body-parser');
const fs = require('fs');
var os = require('os');

// By default, the client will authenticate using the service account file
// specified by the GOOGLE_APPLICATION_CREDENTIALS environment variable and use
// the project specified by the GOOGLE_CLOUD_PROJECT environment variable. See
// https://github.com/GoogleCloudPlatform/google-cloud-node/blob/master/docs/authentication.md
// These environment variables are set automatically on Google App Engine
const {Storage} = require('@google-cloud/storage');

// Instantiate a storage client
const storage = new Storage();

const app = express();
app.set('view engine', 'pug');
// app.set("views", path.join(__dirname, "views"));
app.use(bodyParser.json());
app.use(express.static('public'))
var limits = { fileSize: 5 * 1024 * 1024 * 1024 };

// Multer is required to process file uploads and make them available via
// req.files.
const multer = Multer({
  // storage: Multer.memoryStorage(),
  dest: ''
  /* limits: {
    fileSize: 5 * 1024 * 1024 * 1024, // no larger than 30mb, you can change as needed.
  }, */
/*   filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now())
  } */
});

// A bucket is a container for objects (files).
const bucket = storage.bucket(process.env.GCLOUD_STORAGE_BUCKET);

// Display a form for uploading files.
app.get('/', (req, res) => {
  res.render('form.pug');
});

app.get('/analytics-test', (req, res) => {
  let jsonContent = JSON.parse(fs.readFileSync("public/stats-test.json"));
  res.render('analytics.pug', jsonContent);
});

// Process the file upload and upload to Google Cloud Storage.
app.post('/upload', multer.single('file'), (req, res, next) => {
  if (!req.file) {
    res.status(400).send('No file uploaded.');
    return;
  }

  // Create a new blob in the bucket and upload the file data.
  const blob = bucket.file(req.file.originalname);
  const blobStream = blob.createWriteStream({
    resumable: false,
  });

  blobStream.on('error', err => {
    next(err);
  });

  blobStream.on('finish', () => {
    // The public URL can be used to directly access the file via HTTP.
    // https://storage.googleapis.com/tugbucket1234/TOW-toy-data.wav
    const publicUrl = format(
      `https://storage.googleapis.com/${bucket.name}/${blob.name}`
    );


    ssh.connect({
      host: '35.232.123.204',
      username: 'vagrant',
      privateKey: 'auth/vagrant'
    })
    // Execute a series of commands on the DiViMe VM, and eventually we'll fetch the results.
    .then(function() { 

      console.log('ssh connected to DiViMe');

      const cmd = 'rm -rf /vagrant/data/new_files'
      + '&& mkdir -p /vagrant/data/new_files'
      + '&& wget -P /vagrant/data/new_files ' 
      + `https://storage.googleapis.com/${bucket.name}/${blob.name}`
      + '&& /home/vagrant/launcher/opensmileSad.sh data/new_files'
      + '&& /home/vagrant/launcher/diartk.sh data/new_files/ opensmileSad'
      + `&& python /vagrant/utils_custom/rttm_converter.py /vagrant/data/new_files/diartk_opensmileSad_${blob.name.slice(0, blob.name.length - 4)}.rttm /vagrant/data/new_files/stats.json`

      ssh.execCommand(cmd).then(function(result) {
          // + '&& wget -P /vagrant/data/new_new_files https://storage.googleapis.com/tugbucket1234/TOW-toy-data.wav'
          console.log('STDOUT: ' + result.stdout)
          console.log('STDERR: ' + result.stderr)

          ssh.getFile(`${os.tmpdir()}/stats.json`, '/vagrant/data/new_files/stats.json').then(function(Contents) {
            console.log("The File's contents were successfully downloaded")
            // keys: conversation_turns, turn_rate, recording_length, speech_content
            // let jsonContent = JSON.parse(fs.readFileSync("public/stats.json"));
            let jsonContent = JSON.parse(fs.readFileSync(`${os.tmpdir()}/stats.json`));
            res.render('analytics.pug', jsonContent);
            // res.render('analytics.pug', { num_turns=jsonContent.num_turns } );
            // res.render('analytics.pug');
          }, function(error) {
            console.log("Something's wrong")
            console.log(error)
            res.status(500).send('error in processing');
          })

      })

    });

  });

  blobStream.end(req.file.buffer);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`);
  console.log('Press Ctrl+C to quit.');
});
// [END gae_storage_app]

module.exports = app;