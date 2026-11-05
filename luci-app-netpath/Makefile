#
# NetPath dashboard for LuCI: a live, read-only overview of the device,
# its uplink, radios, SSIDs and stations. The only write is the station
# alias, stored in /etc/config/netpath (own ACL group).
#
# This is free software, licensed under the GNU General Public License,
# version 3 or (at your option) any later version.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-netpath
PKG_VERSION:=1.0.16
PKG_RELEASE:=1
PKG_LICENSE:=GPL-3.0-or-later

LUCI_TITLE:=NetPath dashboard
LUCI_DESCRIPTION:=Live network dashboard (landing page under admin/dashboard): device, \
	uplink, radios, SSIDs and stations with health and experience scores. \
	Read-only except for station names, which are kept in /etc/config/netpath.
# rpcd-mod-iwinfo provides the station lists (iwinfo info/assoclist).
# rpcd-mod-ucode runs the app's plugin (/usr/share/rpcd/ucode/luci.netpath:
# key-free wireless status, thermal zones, validated alias writes), which
# imports the uci, ubus and fs ucode modules; luci-base pulls all four in
# already, they are listed because the plugin needs them.
# Optional at runtime, degrade when absent: rpcd-mod-rrdns (reverse DNS
# names), umdns (mDNS names), hostapd ubus objects (WPS names, client
# capabilities).
LUCI_DEPENDS:=+luci-base +rpcd +rpcd-mod-iwinfo +rpcd-mod-ucode +ucode-mod-uci +ucode-mod-ubus +ucode-mod-fs +ucode-mod-rtnl
LUCI_PKGARCH:=all
LUCI_MAINTAINER:=anothaDev <10740588+anothaDev@users.noreply.github.com>
LUCI_URL:=https://github.com/pg-go/luci-app-netpath

# app.css uses custom properties, color-mix() and container queries,
# which csstidy (a CSS2-era minifier) mangles; ship it byte for byte.
LUCI_MINIFY_CSS:=0

# Language packages (po/<lang>/netpath.po) are luci-i18n-netpath-<lang>
# (luci.mk's default name) and carry the package version instead of one
# derived from git history.
PKG_PO_VERSION:=$(PKG_VERSION)-r$(PKG_RELEASE)

define Package/luci-app-netpath/conffiles
/etc/config/netpath
endef

# Standalone web (port 8080, no password, dashboard only): the setup
# lives in postinst, not in a root/etc/uci-defaults/ file. A uci-defaults
# file shipped 0644 in git fails verify_built_apk (it must ship 0755,
# and git mode 0755 does not survive the connector push), while a
# postinst is a package script, always executable, and is run on
# install and, for a firmware image, on first boot. postinst/postrm
# must be defined BEFORE luci.mk, or luci.mk's default postinst
# (cache clear only) replaces them and the second uhttpd instance
# is never created.
define Package/luci-app-netpath/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] && exit 0
[ -x /usr/sbin/uci ] || exit 0
uci get uhttpd.netpath >/dev/null 2>&1 && exit 0
uci set uhttpd.netpath=uhttpd
uci add_list uhttpd.netpath.listen_http='0.0.0.0:8080'
uci add_list uhttpd.netpath.listen_http='[::]:8080'
uci set uhttpd.netpath.home='/www/netpath'
uci set uhttpd.netpath.cgi_prefix='/cgi-bin'
uci add_list uhttpd.netpath.interpreter='.sh=/bin/sh'
uci set uhttpd.netpath.max_requests='3'
uci set uhttpd.netpath.rfc1918_filter='0'
uci commit uhttpd
[ -f /www/netpath/cgi-bin/api.sh ] && chmod 755 /www/netpath/cgi-bin/api.sh 2>/dev/null
/etc/init.d/uhttpd reload 2>/dev/null || /etc/init.d/uhttpd restart 2>/dev/null || true
exit 0
endef

define Package/luci-app-netpath/postrm
#!/bin/sh
[ -x /usr/sbin/uci ] || exit 0
uci delete uhttpd.netpath 2>/dev/null
uci commit uhttpd 2>/dev/null
/etc/init.d/uhttpd reload 2>/dev/null || true
exit 0
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
