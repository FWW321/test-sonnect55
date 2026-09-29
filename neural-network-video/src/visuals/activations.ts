/** Activation functions and their derivatives, used by the neuron, activation and backprop chapters. */
export const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
export const dSigmoid = (z: number) => {
  const s = sigmoid(z);
  return s * (1 - s);
};
export const tanh = Math.tanh;
export const dTanh = (z: number) => 1 - Math.tanh(z) ** 2;
export const relu = (z: number) => (z > 0 ? z : 0);
export const dRelu = (z: number) => (z > 0 ? 1 : 0);
/** GELU (tanh approximation), the activation of most transformers. */
export const gelu = (z: number) => 0.5 * z * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (z + 0.044715 * z ** 3)));

export const ACTS = {
  sigmoid: { name: "Sigmoid", f: sigmoid, tex: String.raw`\sigma(z)=\frac{1}{1+e^{-z}}` },
  tanh: { name: "Tanh", f: tanh, tex: String.raw`\tanh(z)` },
  relu: { name: "ReLU", f: relu, tex: String.raw`\max(0,\,z)` },
  gelu: { name: "GELU", f: gelu, tex: String.raw`z\cdot\Phi(z)` },
} as const;
