import React, { useState } from "react";

/**
 * Versucht nacheinander mehrere Asset-URLs (z. B. encoded vs. literal), falls
 * der Browser/Bundler eine Variante nicht laedt (broken image).
 */
export function ResilientImg(props: {
  urls: readonly string[];
  alt: string;
  className?: string;
  style?: React.CSSProperties;
}): React.JSX.Element {
  const [idx, setIdx] = useState(0);
  const src = props.urls[idx] ?? props.urls[0] ?? "";
  return (
    <img
      alt={props.alt}
      className={props.className}
      src={src}
      style={props.style}
      onError={() => {
        setIdx((i) => (i + 1 < props.urls.length ? i + 1 : i));
      }}
    />
  );
}
