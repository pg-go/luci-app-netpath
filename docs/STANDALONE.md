# NetPath 独立版：直接开端口看仪表盘

只看仪表盘，其他的看不到，功能也不能设置，没有密码。

## 打开方式

装好 1.0.16 后，打开：

`http://路由器 IP:8080/`

不需要登录，5 秒刷新一次。页面上只有设备、上行、WiFi、有线这四块，没有
LuCI 菜单，没有设置入口，改名（set_alias）也没有。

## 它是怎么做到“只能看仪表盘”的

- 第二个 uhttpd 实例 `uhttpd.netpath`，只监听 8080，根目录只
  有 `/www/netpath`，没有 `lua_prefix`、没有 `ubus_prefix`，
  所以这个端口上根本没有 LuCI、没有 `/ubus`、没有其他页面。
- 数据只走一个只读接口 `/cgi-bin/api.sh`：只接受 GET，只调
  白名单里的 ubus 调用（system board/info、network.interface
  dump、network.device status、luci.netpath wireless/thermal/
  wired、luci-rpc getHostHints、uci get netpath、iwinfo
  assoclist/info、luci.client-rates get），不写 uci、不写文件、
  不调 set_alias、不执行请求里带来的任何东西。
- 安装时由 `Makefile` 里的 postinst 建这个实例（幂等，已有
  就不动）。故意不用 `root/etc/uci-defaults/` 下的文件：那
  个文件在 git 里是 0644，打出来的包却要求 0755，构建校验
  会直接失败；postinst 是包脚本，一定是可执行的，装包时
  跑、进固件时首启跑。卸包时 postrm 会删掉 `uhttpd.netpath`
  这一节。
- 前端三件（index.html、app.js、app.css）放在
  `htdocs/netpath/`，不是 `root/www/netpath/`：luci.mk 只对
  htdocs 复制的那份跑 JsMin，root/ 复制的那份不跑，app.js
  放 root/ 下打出来的包是未压缩的，构建校验按 jsmin 的
  输出比对也会失败。放 htdocs 下，装出来的路径还是
  `/www/netpath/`，不变。

## 安全：先看懂再放外网

**这个端口没有密码。** 谁能连上 8080，谁就能看到仪表盘上的
设备名、MAC、IP、流量和拓扑。

默认是内网才能看：OpenWrt 防火墙默认 wan 入站是 REJECT，
不加规则外网就进不来。只在内网用，就什么都不用再加。

想从外网看，再加一条 wan 到本设备的 8080 规则，跟放行
81、444、5006 那三条的写法一样，只改端口号。加了之后，
任何人拿到你的外网 IP 和端口就能看，没有密码挡着。
不建议长期这样放着；只想自己在外面看，建议走 VPN 回内网，
不要直接把 8080 放到外网。

## 实机检查

```sh
uci get uhttpd.netpath.listen_http
uci get uhttpd.netpath.home
curl -s http://127.0.0.1:8080/cgi-bin/api.sh | head -c 300
curl -s http://127.0.0.1:8080/ | head -n 5
```

- `http://127.0.0.1:8080/cgi-bin/api.sh` 应返回一个 JSON，
  里面有 `board`、`wireless`、`assoc`、`clientRates` 等字段，
  缺的源是 `null`，不是报错页。
- `http://路由器 IP:8080/cgi-bin/luci` 应打不开（404），
  `http://路由器 IP:8080/ubus` 也应打不开。
- 如果 8080 打不开，先看 uhttpd 在不在跑、netpath 这一节
  在不在，再看防火墙有没有拦 8080。

## 如果装完 8080 还没起来

postinst 只在装包 / 首启时跑一次。如果是编进固件的包，
首启没跑起来，就手动跑一次下面这几条（就是 postinst 里
的原样）：

```sh
uci set uhttpd.netpath=uhttpd
uci add_list uhttpd.netpath.listen_http='0.0.0.0:8080'
uci add_list uhttpd.netpath.listen_http='[::]:8080'
uci set uhttpd.netpath.home='/www/netpath'
uci set uhttpd.netpath.cgi_prefix='/cgi-bin'
uci add_list uhttpd.netpath.interpreter='.sh=/bin/sh'
uci set uhttpd.netpath.max_requests='3'
uci set uhttpd.netpath.rfc1918_filter='0'
uci commit uhttpd
chmod 755 /www/netpath/cgi-bin/api.sh
/etc/init.d/uhttpd reload
```

## 关掉它

```sh
uci delete uhttpd.netpath
uci commit uhttpd
/etc/init.d/uhttpd reload
```

或直接卸载 luci-app-netpath，postrm 会做同样的事。
