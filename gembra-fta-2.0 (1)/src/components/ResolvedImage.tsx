import React, { useState, useEffect } from "react";
import { isHeic, convertHeicBase64ToJpeg } from "../utils/heicHelper";

interface ResolvedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  key?: React.Key;
  src?: string;
  source?: string;
  rotation?: number;
  alt?: string;
  className?: string;
  onLoad?: (event?: any) => void;
  onError?: (event?: any) => void;
  referrerPolicy?: React.HTMLAttributeReferrerPolicy;
}

function rotateImage(base64Str: string, rotation: number): Promise<string> {
  return new Promise((resolve) => {
    const angle = ((rotation % 360) + 360) % 360;
    if (angle === 0) {
      resolve(base64Str);
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(base64Str);
          return;
        }

        // Determine canvas dimensions based on rotation
        if (angle === 90 || angle === 270) {
          canvas.width = img.naturalHeight;
          canvas.height = img.naturalWidth;
        } else {
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
        }

        // Rotate and draw
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((angle * Math.PI) / 180);
        ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

        // Export to data URL
        const rotatedDataUrl = canvas.toDataURL("image/jpeg", 0.9);
        resolve(rotatedDataUrl);
      } catch (err) {
        console.error("Erro ao rotacionar imagem:", err);
        resolve(base64Str);
      }
    };
    img.onerror = () => {
      resolve(base64Str);
    };
    img.src = base64Str;
  });
}

export default function ResolvedImage({ src, source, rotation = 0, alt = "", className = "", onLoad, onError, ...props }: ResolvedImageProps) {
  const imageSrc = src || source || "";
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!!imageSrc);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!imageSrc) {
      setResolvedSrc("");
      setIsLoading(false);
      setHasError(false);
      return;
    }

    let active = true;
    setIsLoading(true);
    setHasError(false);

    const getBaseImage = (): Promise<string> => {
      if (isHeic(imageSrc)) {
        return convertHeicBase64ToJpeg(imageSrc);
      }
      return Promise.resolve(imageSrc);
    };

    getBaseImage()
      .then((baseImg) => {
        if (!active) return;
        
        const normRotation = ((rotation % 360) + 360) % 360;
        if (normRotation === 0) {
          setResolvedSrc(baseImg);
          setIsLoading(false);
          return;
        }

        return rotateImage(baseImg, normRotation).then((rotatedImg) => {
          if (active) {
            setResolvedSrc(rotatedImg);
            setIsLoading(false);
          }
        });
      })
      .catch((err) => {
        console.error("Não foi possível processar esta foto:", err);
        if (active) {
          setHasError(true);
          setIsLoading(false);
          if (onError) onError();
        }
      });

    return () => {
      active = false;
    };
  }, [imageSrc, rotation, onError]);

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 text-gray-500 font-semibold text-[10px] select-none p-4 ${className}`}>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-ping" />
          Carregando foto...
        </span>
      </div>
    );
  }

  if (hasError || !resolvedSrc) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 text-red-500 font-semibold text-[10px] text-center select-none p-4 leading-normal ${className}`}>
        Não foi possível processar esta foto
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={className}
      onLoad={onLoad}
      onError={onError}
      {...props}
    />
  );
}
