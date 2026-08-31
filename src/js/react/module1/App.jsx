import React from "react";
import { createRoot } from "react-dom/client";
import { qs } from "../../libs.js";
import './App.sass'

// 1. Сначала объявляем компонент
const Cart = () => {
  return <p>cart</p>;
};

// 2. Затем монтируем его в DOM
//const rootEl = qs('.react-root');
if (rootEl) {
  createRoot(rootEl).render(<Cart />);
}