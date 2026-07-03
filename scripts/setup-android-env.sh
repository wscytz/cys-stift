#!/bin/sh
# Android dev env for cy's Stift (Tauri 2, macOS + Homebrew).
#
# Source before any `tauri android ...` command, because each Claude/CI shell
# starts fresh and the env vars below are not global:
#
#     source scripts/setup-android-env.sh
#     pnpm tauri android init
#     pnpm tauri android build
#
# For everyday terminal use, append the same exports to ~/.zshrc.
#
# Installed via:
#   brew install openjdk@17                      # JDK 17 (formula, no sudo)
#   brew install --cask android-commandlinetools # sdkmanager + platform-tools
#   sdkmanager "platforms;android-34" "build-tools;34.0.0" "ndk;27.0.12077973"
#   rustup target add aarch64-linux-android armv7-linux-androideabi \
#                    i686-linux-android x86_64-linux-android
#
# NOTE: paths are Homebrew Apple-Silicon locations. On Linux / other JDKs,
# adjust JAVA_HOME / ANDROID_HOME accordingly.

export JAVA_HOME="/opt/homebrew/opt/openjdk@17"
export ANDROID_HOME="/opt/homebrew/share/android-commandlinetools"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export NDK_HOME="$ANDROID_HOME/ndk/27.0.12077973"

export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

echo "android env: JAVA=$JAVA_HOME"
echo "android env: ANDROID_HOME=$ANDROID_HOME"
echo "android env: NDK_HOME=$NDK_HOME"
