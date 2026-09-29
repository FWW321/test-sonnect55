# test-sonnect55

**[`host-mv/`](./host-mv)** — MV《宿主》HOST（3:15），灵感来自《寄生兽 生命的准则》片头曲「Let Me Hear」：
AI 对人类虎视眈眈，人类骄傲自大、自以为无所不能，平静的日常底下波涛汹涌。画面用 Remotion 逐帧生成，配乐是从振荡器写起的原创合成器程序，
成片在 [`host-mv/release/host.mp4`](./host-mv/release/host.mp4)。详见 [host-mv/README.md](./host-mv/README.md)。

```bash
cd host-mv
npm install
npm run dev        # Remotion Studio
npm run render     # out/host.mp4（1080p，带配乐）
```

**[`neural-network-video/`](./neural-network-video)** — 一部 10 分钟的中文短片《神经网络》，用 Remotion 全程编程生成
（每个数字、曲线、梯度、决策边界都是真算的），参考了 onetake 的「一镜到底」方法和 remocn 组件库。
详见 [neural-network-video/README.md](./neural-network-video/README.md)。

```bash
cd neural-network-video
npm install
npm run dev        # Remotion Studio
npm run render     # out/neural-network.mp4（1080p，带配乐）
```
