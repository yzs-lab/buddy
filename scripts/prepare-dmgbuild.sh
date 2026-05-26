#!/bin/sh
set -eu

release_name="dmg-builder@1.2.0"
release_version="75c8a6c"
arch="$(uname -m)"

case "$arch" in
  arm64)
    checksum="a785f2a385c8c31996a089ef8e26361904b40c772d5ea65a36001212f1fc25e0"
    ;;
  x86_64)
    checksum="87b3bb72148b11451ee90ede79cc8d59305c9173b68b0f2b50a3bea51fc4a4e2"
    ;;
  *)
    echo "Unsupported macOS architecture: $arch" >&2
    exit 1
    ;;
esac

filename="dmgbuild-bundle-${arch}-${release_version}.tar.gz"
base_url="${ELECTRON_BUILDER_BINARIES_MIRROR:-https://npmmirror.com/mirrors/electron-builder-binaries/}"
base_url="${base_url%/}"
cache_root="${ELECTRON_BUILDER_CACHE:-$HOME/Library/Caches/electron-builder}"
cache_dir="${cache_root}/${release_name}/custom-${arch}-${release_version}"
archive="${cache_dir}/${filename}"

if [ ! -x "${cache_dir}/dmgbuild" ]; then
  mkdir -p "$cache_dir"
  echo "Downloading ${filename} from ${base_url}/${release_name}" >&2
  curl --fail --location --show-error "${base_url}/${release_name}/${filename}" --output "$archive"

  actual_checksum="$(shasum -a 256 "$archive" | awk '{print $1}')"
  if [ "$actual_checksum" != "$checksum" ]; then
    echo "Checksum mismatch for ${filename}" >&2
    echo "Expected: ${checksum}" >&2
    echo "Actual:   ${actual_checksum}" >&2
    rm -f "$archive"
    exit 1
  fi

  tar -xzf "$archive" -C "$cache_dir" --strip-components 1
fi

printf '%s\n' "${cache_dir}/dmgbuild"
