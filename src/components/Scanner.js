import React, { useEffect, useRef } from "react";
import Quagga from "quagga";

export default function Scanner({ scanning, setScanning, onDetected }) {
  const videoRef = useRef(null);

  useEffect(() => {
    let quaggaInitialized = false;
    const target = videoRef.current;

    if (scanning && target) {
      Quagga.init(
        {
          inputStream: {
            type: "LiveStream",
            target,
            constraints: { facingMode: "environment" }
          },
          decoder: {
            readers: [
              "code_128_reader",
              "ean_reader",
              "ean_8_reader",
              "code_39_reader",
              "code_39_vin_reader",
              "codabar_reader",
              "upc_reader",
              "upc_e_reader",
              "i2of5_reader",
              "2of5_reader",
              "code_93_reader"
            ]
          }
        },
        (err) => {
          if (err) {
            console.error("Erro ao iniciar o scanner:", err);
            setScanning(false);
            return;
          }

          quaggaInitialized = true;
          Quagga.start();

          const videoEl = target.querySelector("video");
          if (videoEl) {
            videoEl.style.width = "100%";
            videoEl.style.height = "100%";
            videoEl.style.objectFit = "cover";
          }
        }
      );

      Quagga.onDetected((data) => {
        onDetected(data.codeResult.code);
        setScanning(false);
        Quagga.stop();
      });
    }

    return () => {
      if (quaggaInitialized) {
        Quagga.stop();
        Quagga.offDetected();
        if (target) target.innerHTML = "";
      }
    };
  }, [scanning, setScanning, onDetected]);

  return (
    <div
      ref={videoRef}
      className={`app-camera-preview ${scanning ?"is-scanning" : ""}`}
    />
  );
}
