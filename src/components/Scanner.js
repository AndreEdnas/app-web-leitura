import React, { useEffect, useRef } from 'react';
import Quagga from 'quagga';

export default function Scanner({ scanning, setScanning, onDetected }) {
  const videoRef = useRef(null);

  useEffect(() => {
    let quaggaInitialized = false;

    if (scanning) {
      Quagga.init({
        inputStream: {
          type: 'LiveStream',
          target: videoRef.current,
          constraints: { facingMode: 'environment' },
        },
        decoder: {
          readers: [
            'code_128_reader',
            'ean_reader',
            'ean_8_reader',
            'code_39_reader',
            'code_39_vin_reader',
            'codabar_reader',
            'upc_reader',
            'upc_e_reader',
            'i2of5_reader',
            '2of5_reader',
            'code_93_reader',
          ],
        },
      }, (err) => {
        if (err) {
          console.error('Erro ao iniciar o Quagga:', err);
          setScanning(false);
          return;
        }
        quaggaInitialized = true;
        Quagga.start();

        // Ajusta estilo do vídeo
        const videoEl = videoRef.current.querySelector('video');
        if (videoEl) {
          videoEl.style.width = '100%';
          videoEl.style.height = '100%';
          videoEl.style.objectFit = 'cover';
          videoEl.style.position = 'relative';
          videoEl.style.top = '0';
          videoEl.style.left = '0';
        }
      });

      Quagga.onDetected(data => {
        onDetected(data.codeResult.code);
        setScanning(false);
        Quagga.stop();
      });
    }

    return () => {
      if (quaggaInitialized) {
        Quagga.stop();
        Quagga.offDetected();
        if (videoRef.current) {
          videoRef.current.innerHTML = '';
        }
      }
    };
  }, [scanning, setScanning, onDetected]);

  return (
    <div
      ref={videoRef}
      className="mb-3 rounded border mx-auto"
      style={{
        height: scanning ? '400px' : '0px',
        maxWidth: '100%',
        backgroundColor: '#000',
        position: 'relative',
        overflow: 'hidden',
        transition: 'height 0.3s ease',
      }}
    />
  );
}
