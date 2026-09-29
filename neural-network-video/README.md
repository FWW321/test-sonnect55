# 神经网络 · a 10-minute film in Remotion

一部 **10 分钟（18 000 帧 @ 30 fps）** 的中文短片，讲清楚神经网络是怎么工作的：从一个 `7` 的 784 个像素，到一个神经元、一层、
一个网络，再到损失、梯度下降、反向传播、训练、过拟合、卷积、注意力，最后把 13 002 个参数放进 1750 亿的星系里比一比。
全部用 [Remotion](https://www.remotion.dev) 写成，画面里出现的每一个数字都是真算出来的——**没有一帧是手绘的假曲线**。

> English summary — a fully programmatic, deterministic Remotion film (1280×720 composition, rendered at 1920×1080) that teaches how neural
> networks work in 14 chapters. Every plot, activation, gradient, decision boundary, kernel and attention weight on screen comes from a real
> computation in `src/nn` and `scripts/`; the score is procedural too (`scripts/make-score.ts`). Chapters are welded together by *carried
> objects* (a pixel becomes an input, a plot grows into a full-screen plot, a parameter dot becomes a graph node…), so there is no cut.

## 参考的东西，和怎么用的

| 参考 | 我们从中拿了什么 |
|---|---|
| [feitangyuan/onetake](https://github.com/feitangyuan/onetake) | **一镜到底**的方法论。（onetake 本身不是 Remotion 项目，所以借的是思想而不是代码。）每一章都从上一章「长」出来：相邻章节在 45 帧的重叠窗口里画**同一个被携带的物体、同一个姿态**（见 `src/timeline.ts` 与 `src/visuals/carry.ts`，每处交接都写明「什么被带过去」）；章节长短不一、有留白；镜头运动用真实的时间采样运动模糊（`lib/canvas.tsx`）；所有帧都是「主时间线帧号」的纯函数，可重复渲染。 |
| [remocn](https://github.com/Remocn/remocn) + 它的 skill | 组件：`MaskRevealUp`（章节标题）、`SoftBlurIn`（片名）、`RollingNumber`（参数里程表）、`GlassCodeBlock`（训练循环代码）、`AnimatedLineChart`（训练损失曲线），复制进 `src/components/remocn/`（改动逐条记在那里的 README，MIT 协议随附）。规则：克制的排版（正常字距、纯色字）、一个中性底色 + 两种**有语义**的颜色（青 = 信号/正/类别 B；橙 = 误差/梯度/负/类别 A）、错开的缓出动画（remocn 的 `cubic-bezier(0.22,1,0.36,1)`）、讲故事而不是堆组件。 |

## 章节（每章的「交接物」）

| # | 章 | 时间 | 交接给下一章的东西 |
|---|---|---|---|
| 01 | 像素 | 0:00–0:45 | three pixel values become the inputs of one neuron |
| 02 | 神经元 | 0:45–1:40 | the neuron's activation curve grows into the full-screen plot |
| 03 | 激活函数 | 1:40–2:22 | the row of ReLU units becomes a column of neurons — a layer |
| 04 | 前向传播 | 2:22–3:22 | the network's last two output neurons become the two classes |
| 05 | 折叠空间 | 3:22–4:20 | the spiral picture, with the trained decision field |
| 06 | 损失 | 4:20–4:56 | the loss surface, with the current parameters marked on it |
| 07 | 梯度下降 | 4:56–5:42 | the parameter point becomes the first node, w, of a computation graph |
| 08 | 反向传播 | 5:42–6:49 | the weight-update rule w ← w − η ∂L/∂w, centred |
| 09 | 训练 | 6:49–7:33 | the trained decision boundary and the loss curve |
| 10 | 过拟合 | 7:33–8:01 | the small 3×3 window of pixels |
| 11 | 卷积 | 8:01–8:39 | feature-map cells reflow into a row of tokens |
| 12 | 注意力 | 8:39–9:21 | the probability bars collapse into a parameter counter |
| 13 | 规模 | 9:21–9:43 | one dot in the galaxy zooms back into the very first neuron |
| 14 | 尾声 | 9:43–10:00 | — |

## 「真的」指什么

- **数字分类网络**：784-16-16-10（ReLU / softmax），**13 002** 个参数，在程序生成的 MNIST 风格手写数字上训练，测试集正确率 99.67 %
  （`scripts/train-digits.ts` → `src/data/digit-net.json`）。第 2–4、8 章里的每个激活值、每条连线的颜色和粗细、权重「图」都来自这个网络；
  反向传播那一幕画的是**这个网络对一张真的难例的真梯度**（`visuals/backView.ts`，13 002 个梯度一次反向全部算出）。
- **玩具网络**（`scripts/train-toys.ts`）：把两圈点折进 3-D 的 2-3-1 ReLU 网络、把螺旋线一层层解开的 2-2-2-2-1 tanh 网络；第 9–10 章那次
  **训练全程**（2-16-16-1 tanh，全批量 Adam，24 000 步，逐步快照）和过拟合曲线（训练损失一路降到 0，没见过的点上的损失在第 457 步之后掉头上升到 1.21）；
  三种补救办法（4 倍数据 / 限制权重 / 及时停下）的**真实**测试损失。
- **优化器**（`visuals/descent.ts`）：第 7 章里球滚下的路径、四种步长的对比（0.004 / 0.03 / 0.08 / 0.108，最后一个刚好越过稳定性上限 2/λ<sub>max</sub> ≈ 0.106 而发散）、
  梯度下降 vs 动量 vs Adam 的赛跑，全是在第 6 章的回归损失地形上真跑出来的轨迹。
- **卷积**（`scripts/train-cnn.ts`）：一个 8 核 3×3 的小 CNN，训练过程中卷积核从噪声变成笔画/边缘检测器；特征图是用这些核真卷积出来的。
- **注意力**（`scripts/fit-attention.ts`）：4 维的示意小例子——Q / K 离线拟合到一个合理的关注模式，V 手工设定，其余（点积、softmax、加权和、因果遮罩）都是真计算。画面上标了「示意」。
- 引用的公开数字：LeNet-5 ≈ 6 万、AlexNet ≈ 6000 万、GPT-3 = 1750 亿参数。
- 手写数字是程序生成的（`src/nn/digits.ts`），不是真实的 MNIST；配乐也是程序生成的。

## 运行

```bash
npm install
npm run dev              # Remotion Studio：主片 NeuralNetwork，和「Chapters」文件夹里每章一个独立预览
npm run typecheck

npm run render           # 1080p（--scale=1.5）：out/neural-network.mp4，带配乐
npm run render:silent    # 不带配乐
npm run render:draft     # 0.5× 快速冒烟渲染
```

沙箱里 Remotion 下载不了自己的 Chrome 时，指向任意 Chromium 即可：

```bash
REMOTION_BROWSER=/path/to/chrome REMOTION_CONCURRENCY=4 npm run render
```

重新生成数据（全部确定性，`src/data/*.json` 已提交，不用跑也能渲染）：

```bash
npm run train            # 数字网络 + 玩具网络 + 训练全程 + CNN
npm run train:toys       # 只重训玩具网络 / 训练全程 / 三种补救
npm run train:cnn
npm run fit:attention
npm run score            # 程序化配乐 → public/audio/score.m4a
npm run fonts            # 重新裁剪字体（Noto Sans SC 子集 / Inter / JetBrains Mono，见 scripts/fetch-fonts.mjs）
```

逐章看效果：`node scripts/qa-stills.mjs 7 5.0 20 41`（第 7 章的第 5、20、41 秒），`node scripts/qa-stills.mjs main 100 200`（主时间线上的绝对秒数）。

## 目录

```
src/timeline.ts        14 章、45 帧重叠、总长恰好 18 000 帧（不等于就抛错）
src/script.ts          全片旁白字幕（**青色** / !!橙色!! 标记强调）
src/chapters/          每章一个场景，都是「主时间线帧号」的纯函数
src/visuals/           跨章共用的画面：carry（交接物）、数字网络视图、地形、优化器轨迹、卷积、注意力…
src/nn/                MLP（前向 / 反向 / SGD / Adam）、数据集、程序生成的手写数字
src/lib/               Canvas（DPR、字体门控、运动模糊）、绘图原语、缓动、时间上下文
src/ui/                字幕、章节卡、页角、KaTeX 公式（可逐项点亮）、参数里程表
src/components/remocn/ 从 remocn 复制的组件（含改动说明）
scripts/               训练 / 拟合 / 配乐 / 字体 / 逐章截图
```

## 字体与协议

Noto Sans SC、Inter、JetBrains Mono（均为 SIL OFL，裁剪成子集放在 `public/fonts/`），KaTeX（MIT），remocn 组件（MIT，见 `src/components/remocn/LICENSE`）。
