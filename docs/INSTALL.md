# Installing luci-app-netpath

This guide covers installing the NetPath dashboard
(`luci-app-netpath`, no theme) on a router running OpenWrt, building it
into your own firmware, and undoing all of it again.

All examples use `192.0.2.1` for the router. That is a placeholder from the
documentation address range; replace it with your router's LAN address.

There is no signed package repository for this split yet (see
[README.md](../README.md)). Until one is published from this repository,
install from a tagged Release file, a file you built yourself, or from
a firmware image you built yourself. Release files are unsigned: on
25.12 install the `.apk` with `--allow-untrusted`, and check the
matching `SHA256SUMS` file first.

## Requirements

| OpenWrt | Package manager | Status |
|---|---|---|
| 25.12.x | apk (`.apk`) | Supported. Built with the 25.12 SDK. |
| 24.10.x | opkg (`.ipk`) | Supported. Built with the 24.10 SDK. |

The package is architecture-independent (`noarch`), so the same file
installs on every target: MIPS, ARM, x86 and the rest.

## From a built file

On OpenWrt 25.12, with the `.apk` file and `SHA256SUMS` from the same
build in the current directory on your computer:

```sh
sha256sum -c --ignore-missing SHA256SUMS
scp -O luci-app-netpath-*.apk root@192.0.2.1:/tmp/
ssh root@192.0.2.1 'apk add --no-network --allow-untrusted /tmp/luci-app-netpath-*.apk'
ssh root@192.0.2.1 'rm -f /tmp/luci-app-netpath-*.apk'
```

On 24.10, the same steps with the `.ipk` file and `opkg install`
instead of `apk add`. Then **log out of LuCI and log in again**. The
dashboard is now the first page you see after login (its menu entry is
`admin/dashboard`; if your theme does not make it the landing page,
open it from the menu).

Uninstall: `apk del luci-app-netpath` on 25.12, `opkg remove
luci-app-netpath` on 24.10. The dashboard's own config
(`/etc/config/netpath`, station aliases) is a conffile and is kept
unless you delete it yourself.

## Build from source

```sh
git clone https://github.com/pg-go/luci-app-netpath.git
cd luci-app-netpath
dev/build/sdk-build.sh 25.12.4      # needs podman; builds the committed HEAD
```

The built package, `SHA256SUMS` and `BUILDINFO` land in
`dist/25.12.4/`. For 24.10, run `dev/build/sdk-build.sh 24.10.8`
instead; it produces an `.ipk`.

## Build it into your own firmware

Copy the package directory into a feed directory and select it, the
way a PonWrt/HG5585F build does it:

```sh
cp -r luci-app-netpath package/custom/luci-app-netpath
# in menuconfig, or in your config file:
# CONFIG_PACKAGE_luci-app-netpath=y
```

The package needs only `luci-base` and the rpcd modules listed in its
`Makefile` (`LUCI_DEPENDS`); it does not need any theme package. After
flashing, log out of LuCI and log in again.

## Troubleshooting

- **The dashboard page opens but shows no data:** check that `rpcd`
  is running and that the `luci.netpath` plugin is loaded
  (`/usr/share/rpcd/ucode/luci.netpath` must exist). The plugin is
  part of the package; a partial install is the usual cause.
- **The page looks unstyled:** the dashboard reads the theme's
  `--v-*` properties with fallbacks, so it should still render under
  Bootstrap or any other theme. A completely unstyled page usually
  means `app.css` did not install; reinstall the package.
- **A station name you set is gone after an upgrade:** station
  aliases live in `/etc/config/netpath`, which is a conffile and is
  kept on upgrade. If you flashed a new firmware image without keeping
  settings, that file is gone with the rest of the overlay.
