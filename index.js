#!/usr/bin/env node

// Gaudi is installed globally on people's computers. This means
// that it is extremely difficult to have them upgrade the version and
// because there's only one global version installed, it is very prone to
// breaking changes.
//
// The only job of Gaudi is to init the repository and then
// forward all the commands to the local version of Gaudi.
//
// If you need to add a new command, please add it to the scripts/ folder.
//
// The only reason to modify this file is to add more warnings and
// troubleshooting information for the `Gaudi` command.
//
// Try to avoid making breaking changes! We want to avoid people
// having to update their global version of Gaudi.
//
// I think this needs node 4.0+ to run

'use strict';

let fs = require('fs');
let path = require('path');
let spawn = require('cross-spawn');
let semver = require('semver');
let pathExists = require('path-exists');
let chalk = require('chalk');
let figlet = require('figlet');
let inquirer = require('inquirer');

showIntro()
  .then(askQuestions)
  .then(answers => {
    if (answers.type === 'js-backend') return console.log('Sorry this is not implemented yet.'); // todo: this

    let verbosity = false; // set to true to get verbose install info
    createApp(answers.appName, verbosity);
  });

function showIntro () {
  return new Promise((res, rej) => {
    figlet.text('Gaudi', {
      font: 'Bloody',
      horizontalLayout: 'default',
      verticalLayout: 'default'
    }, (err, data) => {
      if (err) {
        console.log('Error rendering header logo');
        console.dir(err);
      }

      console.log('');
      console.log(chalk.gray(data));
      console.log(chalk.yellow(`Welcome to Gaudi!      Version ${require('./package.json').version}\n`));
      res();
    });
  });
}

function askQuestions () {
  return new Promise((res, rej) => {
    let typeDict = [
      {value: 'js-frontend', label: 'Javascript frontend (put on S3)'},
      {value: 'js-backend', label: 'Javascript backend (API server, cron job)'}
    ];
    let typeChoices = typeDict.map(x => x.label);

    let questions = [
      {
        type: 'input',
        name: 'appName',
        message: 'What\'s the name of your project?',
        validate: value => {
          if (!value) return 'Please enter a project name';
          if (value.split(' ').length > 1) return 'No spaces, please';
          return true;
        }
      },
      {
        type: 'rawlist',
        name: 'type',
        message: 'What type of project is this?',
        choices: typeChoices,
        filter: choice => {
          return typeDict.find(x => x.label === choice).value;
        }
      }
    ];

    inquirer.prompt(questions)
      .then(answers => {
        console.log('\n');
        res(answers);
      });
  });
}

function createApp(name, verbose) {
  let root = path.resolve(name);
  let appName = path.basename(root);

  checkAppName(appName);

  if (!pathExists.sync(name)) {
    fs.mkdirSync(root);
  } else if (!isSafeToCreateProjectIn(root)) {
    console.log('The directory `' + name + '` contains file(s) that could conflict. Aborting.');
    process.exit(1);
  }

  console.log(
    'Creating a new javascript frontend app in ' + root + '.'
  );
  console.log();

  let packageJson = {
    name: appName,
    version: '0.1.0',
    private: true,
  };
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );
  let originalDirectory = process.cwd();
  process.chdir(root);

  console.log('Installing packages. This might take a couple minutes.');
  console.log('Installing gaudi-scripts from npm...');
  console.log();

  run(root, appName, verbose, originalDirectory);
}

function run(root, appName, verbose, originalDirectory) {
  let installPackage = 'gaudi-scripts';
  let packageName = 'gaudi-scripts';
  let args = [
    'install',
    verbose && '--verbose',
    '--save-dev',
    '--save-exact',
    installPackage,
  ].filter(function(e) { return e; });
  let proc = spawn('npm', args, {stdio: 'inherit'});
  proc.on('close', function (code) {
    if (code !== 0) {
      console.error('`npm ' + args.join(' ') + '` failed');
      return;
    }

    checkNodeVersion(packageName);

    let scriptsPath = path.resolve(
      process.cwd(),
      'node_modules',
      packageName,
      'scripts',
      'init.js'
    );
    let init = require(scriptsPath);
    init(root, appName, verbose, originalDirectory);
  });
}

function checkNodeVersion(packageName) {
  let packageJsonPath = path.resolve(
    process.cwd(),
    'node_modules',
    packageName,
    'package.json'
  );
  let packageJson = require(packageJsonPath);
  if (!packageJson.engines || !packageJson.engines.node) {
    return;
  }

  if (!semver.satisfies(process.version, packageJson.engines.node)) {
    console.error(
      chalk.red(
        'You are currently running Node %s but gaudi requires %s.' +
        ' Please use a supported version of Node.\n'
      ),
      process.version,
      packageJson.engines.node
    );
    process.exit(1);
  }
}

function checkAppName(appName) {
  // TODO: there should be a single place that holds the dependencies
  let dependencies = ['react', 'react-dom'];
  let devDependencies = ['gaudi-scripts'];
  let allDependencies = dependencies.concat(devDependencies).sort();

  if (allDependencies.indexOf(appName) >= 0) {
    console.error(
      chalk.red(
        'We cannot create a project called `' + appName + '` because a dependency with the same name exists.\n' +
        'Due to the way npm works, the following names are not allowed:\n\n'
      ) +
      chalk.cyan(
        allDependencies.map(function(depName) {
          return '  ' + depName;
        }).join('\n')
      ) +
      chalk.red('\n\nPlease choose a different project name.')
    );
    process.exit(1);
  }
}

// If project only contains files generated by GH, it’s safe.
// We also special case IJ-based products .idea because it integrates with CRA:
// https://github.com/facebookincubator/create-react-app/pull/368#issuecomment-243446094
function isSafeToCreateProjectIn(root) {
  let validFiles = [
    '.DS_Store', 'Thumbs.db', '.git', '.gitignore', '.idea', 'README.md', 'LICENSE'
  ];
  return fs.readdirSync(root)
    .every(function(file) {
      return validFiles.indexOf(file) >= 0;
    });
}
