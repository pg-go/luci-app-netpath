#!/bin/sh
# NetPath standalone API: read-only dashboard data, no password.
#
# Served only by the second uhttpd instance (uhttpd.netpath, port 8080,
# home /www/netpath, no lua_prefix, no ubus_prefix). That instance serves
# nothing else: no LuCI, no /ubus, no other page, no write path.
#
# This script only answers GET, only calls the whitelisted ubus objects
# below, and never writes anything: no uci set/commit, no set_alias,
# no file write, no reboot, no exec of anything the request names.
# A source that is absent or fails degrades to null in the reply, never
# to an error page: the dashboard shows "no data" for that part.
#
# Only busybox tools are used (sh, ubus, grep, sort, printf): no jq,
# no jsonfilter, no python, no node on the device.

# Only GET: a POST/PUT/DELETE is not a dashboard read.
if [ "${REQUEST_METHOD:-GET}" != "GET" ]; then
	printf 'Status: 405 Method Not Allowed\r\n'
	printf 'Content-Type: text/plain\r\n\r\n'
	printf 'method not allowed\n'
	exit 0
fi

printf 'Content-Type: application/json\r\n'
printf 'Cache-Control: no-store\r\n'
printf 'X-Content-Type-Options: nosniff\r\n'
printf '\r\n'

# call_json <object> <method> [args-json]
# Prints the ubus reply as-is, or null when ubus fails / answers nothing.
call_json() {
	local out
	if [ -n "$3" ]; then
		out=$(ubus call "$1" "$2" "$3" 2>/dev/null) || out=""
	else
		out=$(ubus call "$1" "$2" 2>/dev/null) || out=""
	fi
	if [ -z "$out" ]; then
		printf 'null'
	else
		printf '%s' "$out"
	fi
}

BOARD=$(call_json system board)
INFO=$(call_json system info)
IFACES=$(call_json network.interface dump)
DEVS=$(call_json network.device status)
WIRELESS=$(call_json luci.netpath wireless)
THERMAL=$(call_json luci.netpath thermal)
WIRED=$(call_json luci.netpath wired)
HINTS=$(call_json luci-rpc getHostHints)
ALIASES=$(call_json uci get '{"config":"netpath"}')

# Interface names, from luci.netpath wireless only, validated before
# they are ever passed back to ubus. grep is used instead of a JSON
# parser on purpose: the reply is ubus JSON, and the pattern only
# matches a quoted ifname value of safe characters.
IFNAMES=$(printf '%s' "$WIRELESS" | grep -oE '"ifname":"[A-Za-z0-9_.-]{1,15}"' 2>/dev/null | cut -d'"' -f4 | sort -u)

# Fallback when wireless gives no interface (vendor driver, no netifd):
# try the usual wireless interface names present in /sys/class/net.
if [ -z "$IFNAMES" ]; then
	for p in /sys/class/net/ra* /sys/class/net/rai* /sys/class/net/wlan* /sys/class/net/phy* /sys/class/net/ath* /sys/class/net/wl*; do
		[ -e "$p" ] || continue
		b=$(basename "$p")
		case "$b" in
			ra*|rai*|wlan*|phy*|ath*|wl*) IFNAMES="$IFNAMES $b" ;;
		esac
	done
fi

# assoclist + iwinfo info per interface, keyed by interface name.
ASSOC='{'
IWIN='{'
FIRST=1
for IF in $IFNAMES; do
	case "$IF" in
		''|*[!A-Za-z0-9_.-]*) continue ;;
	esac
	A=$(call_json iwinfo assoclist "{\"device\":\"$IF\"}")
	I=$(call_json iwinfo info "{\"device\":\"$IF\"}")
	if [ "$FIRST" = "1" ]; then FIRST=0; else ASSOC="$ASSOC,"; IWIN="$IWIN,"; fi
	ASSOC="$ASSOC\"$IF\":$A"
	IWIN="$IWIN\"$IF\":$I"
done
ASSOC="$ASSOC}"
IWIN="$IWIN}"

# client-rates fallback (QWRT / vendor firmware whose iwinfo station
# bytes stay 0): addresses are the IPv4 addresses the host hints give,
# at most 64, deduplicated, validated before they are passed to ubus.
# IPv6-only devices are not queried here: their IPv4 address, when they
# have one, is what conntrack is asked about.
IPS=$(printf '%s' "$HINTS" | grep -oE '"[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}"' 2>/dev/null | tr -d '"' | sort -u | head -n 64)
ADDRS='['
FIRST=1
for IP in $IPS; do
	case "$IP" in
		[0-9]*.[0-9]*.[0-9]*.[0-9]*) ;;
		*) continue ;;
	esac
	if [ "$FIRST" = "1" ]; then FIRST=0; else ADDRS="$ADDRS,"; fi
	ADDRS="$ADDRS\"$IP\""
done
ADDRS="$ADDRS]"
if [ "$ADDRS" = "[]" ]; then
	RATES='null'
else
	RATES=$(call_json luci.client-rates get "{\"addresses\":$ADDRS}")
fi

printf '{"board":%s,"info":%s,"interfaces":%s,"devices":%s,"wireless":%s,"thermal":%s,"wired":%s,"hints":%s,"aliases":%s,"assoc":%s,"iwinfo":%s,"clientRates":%s}\n' \
	"$BOARD" "$INFO" "$IFACES" "$DEVS" "$WIRELESS" "$THERMAL" "$WIRED" "$HINTS" "$ALIASES" "$ASSOC" "$IWIN" "$RATES"
