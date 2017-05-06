#!/usr/bin/env node

// Copyright (c) Rotorz Limited. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root.

"use strict"

const colors = require('colors/safe');
const extfs = require('extfs');
const fs = require("fs-extra");
const path = require("path");


//
// DO NOT MODIFY: The following relative path should be hard coded because it is used as
//                a safety guard when removing redundant packages (directories are only
//                removed if they contain this path).
//
const PROJECT_RELATIVE_PACKAGES_PATH = path.join("Assets", "Plugins", "Packages");


const projectRootDir = process.cwd();
const projectConfigPath = path.join(projectRootDir, "package.json");
const projectConfig = fs.readJsonSync(projectConfigPath);
const projectPackagesDir = path.join(projectRootDir, PROJECT_RELATIVE_PACKAGES_PATH);
const projectDependencies = (projectConfig.dependencies || { });
const projectDependencyNames = new Set(Object.keys(projectDependencies));


const specialKeyword = "unity3d-package";
const extraFiles = [ "package.json", "README.md", "LICENSE" ];


console.log("Syncing packages in Unity project...");


// Phase 1 - Copy packages from node packages into project's packages directory.

for (let dependencyName of Object.keys(projectDependencies)) {
  const dependencyDir = path.join(projectRootDir, "node_modules", dependencyName);
  const dependencyConfigPath = path.join(dependencyDir, "package.json");
  const dependencyConfig = fs.readJsonSync(dependencyConfigPath);
  const dependencyKeywords = dependencyConfig.keywords || [ ];

  // Skip packages that do not need to be installed using this mechanism.
  if (!dependencyKeywords.includes(specialKeyword)) {
    continue;
  }

  console.log("");
  console.log(colors.cyan("  " + dependencyName));

  // Get information about the package that has already been installed into
  // the Unity project.
  const assetsTargetPath = path.resolve(projectPackagesDir, dependencyName);
  validateProjectPackageDirectory(assetsTargetPath);

  const assetsTargetConfigPath = path.join(assetsTargetPath, "package.json");
  if (fs.existsSync(assetsTargetConfigPath)) {
    const assetsTargetConfig = fs.readJsonSync(assetsTargetConfigPath);

    // Skip installation of this package if the one that has already been
    // installed into the Unity project has the same version number.
    if (dependencyConfig.version === assetsTargetConfig.version) {
      console.log("    Already latest version.");
      continue;
    }
  }


  // Okay, we need to install the package into the Unity project.
  console.log("    Preparing package directory...");
  fs.emptyDirSync(assetsTargetPath);
  console.log("    Copying asset files...");
  copyIfExistsSync("assets", "");
  console.log("    Copying extra files...");
  extraFiles.forEach(copyIfExistsSync);


  function copyIfExistsSync(sourceRelativeFileName, targetRelativeFileName) {
    const sourcePath = path.join(dependencyDir, sourceRelativeFileName);
    if (fs.existsSync(sourcePath)) {
      if (typeof targetRelativeFileName !== "string") {
        targetRelativeFileName = sourceRelativeFileName;
      }
      const targetPath = path.join(assetsTargetPath, targetRelativeFileName);
      fs.copySync(sourcePath, targetPath);
    }
  }
}

console.log("");


// Phase 2 - Remove redundant packages from the project's packages directory.

const projectPackageListing = getProjectPackageListing();
const projectRedundantPackageNames = projectPackageListing.filter(packageName => !projectDependencyNames.has(packageName));

for (let redundantPackageName of projectRedundantPackageNames) {
  const redundantPackageDir = path.resolve(projectPackagesDir, redundantPackageName);
  const redundantPackageMetaPath = path.resolve(projectPackagesDir, redundantPackageName + ".meta");
  validateProjectPackageDirectory(redundantPackageDir);

  console.log(colors.red("  Removing " + redundantPackageName));

  if (fs.existsSync(redundantPackageDir)) {
    fs.removeSync(redundantPackageDir);
  }

  if (fs.existsSync(redundantPackageMetaPath)) {
    fs.unlinkSync(redundantPackageMetaPath);
  }
}

console.log("");


// Phase 3 - Remove empty scope directories from project's packages directory.

for (let projectPackageScope of getProjectPackageScopes()) {
  const projectPackageScopeDir = path.resolve(projectPackagesDir, projectPackageScope);
  const projectPackageScopeMeta = path.resolve(projectPackagesDir, projectPackageScope + ".meta");
  validateProjectPackageDirectory(projectPackageScopeDir);

  if (extfs.isEmptySync(projectPackageScopeDir)) {
    fs.removeSync(projectPackageScopeDir);

    if (fs.existsSync(projectPackageScopeMeta)) {
      fs.unlinkSync(projectPackageScopeMeta);
    }
  }
}


// Helper functions:

function validateProjectPackageDirectory(packageDir) {
  if (!packageDir.includes(PROJECT_RELATIVE_PACKAGES_PATH)) {
    throw new Error("Project package has an unexpected path: " + packageDir);
  }
}

function getProjectPackageListing() {
  return flatMap(getDirectories(projectPackagesDir), packageDirectory =>
    packageDirectory.startsWith("@")
      ? getDirectories(path.join(projectPackagesDir, packageDirectory))
          .map(scopedPackageName => packageDirectory + "/" + scopedPackageName)
      : packageDirectory
  );
}

function getProjectPackageScopes() {
  return getDirectories(projectPackagesDir)
    .filter(packageDirectory => packageDirectory.startsWith("@"));
}

// Copied from: http://stackoverflow.com/questions/10865025/merge-flatten-an-array-of-arrays-in-javascript
function flatMap(a, cb) {
  return [].concat(...a.map(cb));
}

// Copied from: http://stackoverflow.com/a/24594123/656172
function getDirectories(srcpath) {
  return fs.readdirSync(srcpath)
    .filter(file => fs.statSync(path.join(srcpath, file)).isDirectory())
}
