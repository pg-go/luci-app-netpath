# NetPath

**NetPath: a live network dashboard for LuCI, without a theme.** A live, read-only
overview of the device, its uplink, radios, SSIDs and stations, at
`admin/dashboard` (the landing page after login).

This repository is the dashboard half split out of
`pg-go/luci-theme-vantage` at its commit `b7e504b`: the same
`luci-app-netpath` package, the same network-path work (Wi-Fi clients and
wired devices each in their own box, with their own traffic wire, leaf
names at 10.5px), minus the `luci-theme-vantage` package, and renamed from
`luci-app-vantage` to `luci-app-netpath` (package, config, translations,
menu, ACL and RPC object all renamed). The dashboard
works under any LuCI theme: it reads a theme only through `--v-*`
custom properties, each with a fallback, and its classes are `np-*`
scoped under `.np-app`.


## What you get

- Health verdict with checks for uplink, CPU, memory, Wi-Fi, client
  signal and storage, each with a one-line reason; a check opens what
  it is about (a weak client's details, or the list when several are
  weak)
- Network path from gateway to access point, radios and SSIDs, and a
  Wired branch for the Ethernet ports; click any node for details
- Live throughput for the uplink and every radio (last 5 minutes),
  radio cards with channel, width, TX power and noise
- Clients with human names (your alias, reverse DNS, mDNS, DHCP hints,
  WPS device name, vendor, or "Private device" for randomised MACs),
  signal, link rate, Wi-Fi generation, live traffic and an experience
  score with its reason; filters by band, activity, weak signal and
  new clients. Wired devices too, from the bridge's table: port, link
  speed, traffic when a device has its port to itself (else the port's
  total), and when each was last heard
- Client inspector: signal history, link rates, capabilities, traffic,
  retries; rename a device in place
- Top talkers, wireless networks, system tile (CPU per core, memory,
  storage, firmware)
- Firewall overview (Network → Firewall → Overview): what is open
  from the internet, which zone reaches which, what is switched off
  or ignored, and warnings for the risky cases, read the way firewall4
  reads the config; every item links to the LuCI page that changes it
- Your own layout: drag tiles, change their width or hide them; saved
  in the browser for each screen size, with a reset to the default

## Install

See [docs/INSTALL.md](docs/INSTALL.md): install a built `.apk` / `.ipk`
on a router, build it from source with the pinned OpenWrt SDK
(`dev/build/sdk-build.sh`), or build it into your own firmware by
copying `luci-app-netpath/` into a feed directory (the way the
PonWrt/HG5585F firmware does it) and selecting
`CONFIG_PACKAGE_luci-app-netpath=y`.

There is no signed package repository for this split yet: the signed
repository and its keys lived in the theme repository, and they do not
carry over. Do not trust a repository index that claims to be this
project's until one is published from here. Until then, install from
a file you built yourself, or from a firmware image you built
yourself, and check `SHA256SUMS` from the same build.

## Develop

No npm, no `package.json`, no build step for the UI: the files under
`htdocs/` ship as they are. Needs Node.js only for the tests and the
offline replay.

```sh
node --test tests/            # the suite; UCODE=/path/to/ucode also runs the real rpcd plugin
dev/i18n/update.sh --check    # translation templates match the sources
node security-tests/check_dom_sinks.js
node security-tests/test_acl_policy.js
node security-tests/check_private_addresses.js
```

The replay needs two local inputs that are not in the repository: a
recording (`--mirror`) and a LuCI 25.12 root filesystem (`--rootfs`).
With both, the dashboard runs under Bootstrap (no theme):

```sh
node dev/replay/server.js --mirror ../netpath-mirror --port 8097 --app-dir luci-app-netpath
```

Open `http://127.0.0.1:8097/`; any username and password log in.

For coding rules, see [AGENTS.md](AGENTS.md); for contributing, see
[CONTRIBUTING.md](CONTRIBUTING.md). The dashboard is free software,
licensed under the GNU General Public License, version 3 or (at your
option) any later version; see [LICENSE](LICENSE).
