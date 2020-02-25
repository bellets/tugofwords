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


const process = require('process'); // Required to mock environment variables
process.env.GCLOUD_STORAGE_BUCKET = 'tugbucket1234';


// [START gae_storage_app]
const {format} = require('util');
const express = require('express');
const Multer = require('multer');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
// const { exec } = require('child_process');
var exec = require('child-process-promise').exec;
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
  let jsonContent = JSON.parse(fs.readFileSync(`/vagrant/data/BN31_020108a_9m7vgk4t8pf/stats.json`));
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

    const randomid = Math.random().toString(36).slice(2);
    const rec_name = blob.name.split('.')[0];
    // const rec_name = blob.name.split('.').slice(0, -1).join('.'); 
    console.log(`recording name: ${rec_name}`)
    const datadir = `${rec_name}_${randomid}`;
    console.log(`/vagrant/utils_custom/process_file.sh ${datadir} ${blob.name}`)
    exec(`/vagrant/utils_custom/process_file.sh ${datadir} ${blob.name}`)
      .then(function (result) {
        console.log(`stdout: ${result.stdout}`);
        console.log(`stderr: ${result.stdout}`);
        let jsonContent = JSON.parse(fs.readFileSync(`/vagrant/data/${datadir}/stats.json`));
        res.render('analytics.pug', jsonContent);
      })
      .catch(function (err) {
        console.error('ERROR: ', err);
        res.send('Failure in processing file: file likely too large or of the incorrect file type. WAV and ZIP are accepted. ');
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