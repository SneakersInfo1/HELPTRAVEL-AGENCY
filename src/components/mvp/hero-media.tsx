"use client";

import Image from "next/image";
import { useState } from "react";

interface HeroMediaProps {
  src: string;
  poster: string;
  alt: string;
  className?: string;
}

export function HeroMedia({ src, poster, alt, className = "" }: HeroMediaProps) {
  const [videoFailed, setVideoFailed] = useState(false);

  if (videoFailed) {
    return <Image src={poster} alt={alt} fill priority className={`object-cover ${className}`} sizes="100vw" />;
  }

  return (
    <video
      autoPlay
      muted
      loop
      playsInline
      poster={poster}
      onError={() => setVideoFailed(true)}
      className={`h-full w-full object-cover ${className}`}
    >
      <source src={src} type="video/mp4" />
    </video>
  );
}

