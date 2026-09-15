const fs = require('fs');
const os = require('os');
const path = require('path');

const { withGradleProperties } = require('@expo/config-plugins');

const GRADLE_JAVA_HOME = 'org.gradle.java.home';

function listDirectories(directory) {
  try {
    return fs
      .readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(directory, entry.name));
  } catch {
    return [];
  }
}

function getJavaVersion(javaHome) {
  try {
    const release = fs.readFileSync(path.join(javaHome, 'release'), 'utf8');
    return /^JAVA_VERSION="([^"]+)"/m.exec(release)?.[1] ?? null;
  } catch {
    return null;
  }
}

function getPlatformCandidates() {
  const homeDirectory = process.env.USERPROFILE || os.homedir();
  const candidates = [
    process.env.EXPO_JAVA_HOME,
    process.env.JAVA_HOME,
    ...listDirectories(path.join(homeDirectory, '.gradle', 'jdks')),
  ];

  if (process.platform === 'win32') {
    const programRoots = [
      process.env.ProgramFiles,
      process.env['ProgramFiles(x86)'],
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs'),
    ].filter(Boolean);

    for (const programRoot of programRoots) {
      candidates.push(
        ...listDirectories(path.join(programRoot, 'Microsoft')),
        ...listDirectories(path.join(programRoot, 'Eclipse Adoptium')),
        ...listDirectories(path.join(programRoot, 'Java')),
        ...listDirectories(path.join(programRoot, 'Zulu')),
        ...listDirectories(path.join(programRoot, 'Amazon Corretto')),
        path.join(programRoot, 'Android', 'Android Studio', 'jbr'),
      );
    }
  } else if (process.platform === 'darwin') {
    for (const directory of [
      '/Library/Java/JavaVirtualMachines',
      path.join(homeDirectory, 'Library', 'Java', 'JavaVirtualMachines'),
    ]) {
      candidates.push(
        ...listDirectories(directory).map((bundle) =>
          path.join(bundle, 'Contents', 'Home'),
        ),
      );
    }

    candidates.push(
      '/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home',
      '/usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home',
    );
  } else {
    candidates.push(...listDirectories('/usr/lib/jvm'));
  }

  return candidates;
}

function findJava17Home() {
  const uniqueCandidates = [
    ...new Set(
      getPlatformCandidates()
        .filter(Boolean)
        .map((candidate) => path.resolve(candidate)),
    ),
  ];
  const javaExecutable = process.platform === 'win32' ? 'java.exe' : 'java';

  return uniqueCandidates.find(
    (javaHome) =>
      /^17(?:\.|$)/.test(getJavaVersion(javaHome) ?? '') &&
      fs.existsSync(path.join(javaHome, 'bin', javaExecutable)),
  );
}

module.exports = function withJava17(config) {
  return withGradleProperties(config, (gradleConfig) => {
    const javaHome = findJava17Home();

    if (!javaHome) {
      throw new Error(
        '[with-java-17] Android builds require JDK 17. Install it or set EXPO_JAVA_HOME/JAVA_HOME to its installation directory, then run Expo prebuild again.',
      );
    }

    gradleConfig.modResults = gradleConfig.modResults.filter(
      (item) => item.type !== 'property' || item.key !== GRADLE_JAVA_HOME,
    );
    gradleConfig.modResults.push({
      type: 'property',
      key: GRADLE_JAVA_HOME,
      value: javaHome.replace(/\\/g, '/'),
    });

    return gradleConfig;
  });
};
