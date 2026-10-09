## corpus-knobs-small (corpus)

Pixel 10 Pro Fold Tensor G5, Android 17 (SDK 37), bench 3f2e534e802d, sherpa-onnx 1.13.0. 

| Modelo | Runtime | Acond. | Verif. ms | Carga ms | Calent. ms | Decodes | p50 ms | p95 ms | máx ms | RTF | WER es | WER ca | CER es | CER ca | Palabras no-voz | Rechazos | Térmico antes→después |
|---|---|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| whisper-small-es | threads=4;provider=cpu;tail=default | off | 621 | 3798 | 2619/2481 | 45 | 3282 | 5101 | 5987 | 0.644 | 0.164 | 0.359 | 0.062 | 0.155 | 0 | NONE:35,LANGUAGE:10 | 1→1 |
| whisper-small-es | threads=4;provider=cpu;tail=default | on | 621 | 3798 | 2619/2481 | 45 | 2861 | 4492 | 5416 | 0.562 | 0.158 | 0.394 | 0.074 | 0.201 | 0 | NONE:34,LANGUAGE:11 | 1→1 |
| whisper-small-es | threads=4;provider=cpu;tail=300 | off | 869 | 3466 | 2101/1946 | 45 | 2854 | 4875 | 5287 | 0.562 | 0.158 | 0.400 | 0.061 | 0.202 | 0 | NONE:34,LANGUAGE:11 | 1→1 |
| whisper-small-es | threads=4;provider=cpu;tail=300 | on | 869 | 3466 | 2101/1946 | 45 | 2722 | 4888 | 5032 | 0.552 | 0.158 | 0.435 | 0.071 | 0.188 | 0 | NONE:35,LANGUAGE:10 | 1→1 |
| whisper-small-es | threads=4;provider=xnnpack;tail=default (xnnpack registered (no fallback logged; node assignment not verified)) | off | 645 | 4175 | 2793/2674 | 45 | 3582 | 5527 | 6084 | 0.704 | 0.164 | 0.359 | 0.062 | 0.155 | 0 | NONE:35,LANGUAGE:10 | 1→1 |
| whisper-small-es | threads=4;provider=xnnpack;tail=default (xnnpack registered (no fallback logged; node assignment not verified)) | on | 645 | 4175 | 2793/2674 | 45 | 3276 | 5142 | 6123 | 0.651 | 0.158 | 0.394 | 0.074 | 0.201 | 0 | NONE:34,LANGUAGE:11 | 1→1 |
| whisper-small-es | threads=4;provider=xnnpack;tail=300 (xnnpack registered (no fallback logged; node assignment not verified)) | off | 465 | 4045 | 1958/1951 | 45 | 2960 | 5093 | 5350 | 0.576 | 0.158 | 0.400 | 0.061 | 0.202 | 0 | NONE:34,LANGUAGE:11 | 1→1 |
| whisper-small-es | threads=4;provider=xnnpack;tail=300 (xnnpack registered (no fallback logged; node assignment not verified)) | on | 465 | 4045 | 1958/1951 | 45 | 2671 | 4935 | 5163 | 0.556 | 0.158 | 0.435 | 0.071 | 0.188 | 0 | NONE:35,LANGUAGE:10 | 1→1 |

## corpus-threads-2 (corpus)

Pixel 10 Pro Fold Tensor G5, Android 17 (SDK 37), bench 3f2e534e802d, sherpa-onnx 1.13.0. 

| Modelo | Runtime | Acond. | Verif. ms | Carga ms | Calent. ms | Decodes | p50 ms | p95 ms | máx ms | RTF | WER es | WER ca | CER es | CER ca | Palabras no-voz | Rechazos | Térmico antes→después |
|---|---|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| whisper-base-es | threads=1;provider=cpu;tail=default | on | 175 | 579 | 740/686 | 135 | 791 | 1532 | 1704 | 0.170 | 0.249 | 0.559 | 0.082 | 0.326 | 0 | NONE:29,LANGUAGE:16 | 0→0 |
| whisper-base-es | threads=2;provider=cpu;tail=default | on | 138 | 656 | 554/526 | 135 | 648 | 1527 | 1622 | 0.152 | 0.249 | 0.559 | 0.082 | 0.326 | 0 | NONE:29,LANGUAGE:16 | 0→1 |
| whisper-base-es | threads=4;provider=cpu;tail=default | on | 164 | 916 | 513/529 | 135 | 624 | 1280 | 1495 | 0.141 | 0.249 | 0.559 | 0.082 | 0.326 | 0 | NONE:29,LANGUAGE:16 | 1→1 |
| whisper-base-es | threads=6;provider=cpu;tail=default | on | 223 | 1197 | 639/586 | 135 | 649 | 1502 | 1541 | 0.145 | 0.237 | 0.559 | 0.077 | 0.326 | 0 | NONE:29,LANGUAGE:16 | 1→1 |
| whisper-small-es | threads=1;provider=cpu;tail=default | on | 725 | 2981 | 4043/3910 | 135 | 3411 | 5070 | 6034 | 0.677 | 0.158 | 0.394 | 0.074 | 0.201 | 0 | NONE:34,LANGUAGE:11 | 1→1 |
| whisper-small-es | threads=2;provider=cpu;tail=default | on | 483 | 2843 | 2383/2309 | 135 | 2858 | 4747 | 5217 | 0.600 | 0.158 | 0.394 | 0.074 | 0.201 | 0 | NONE:34,LANGUAGE:11 | 1→1 |
| whisper-small-es | threads=4;provider=cpu;tail=default | on | 349 | 2544 | 1836/1779 | 135 | 2896 | 5194 | 6559 | 0.616 | 0.158 | 0.394 | 0.074 | 0.201 | 0 | NONE:34,LANGUAGE:11 | 1→1 |
| whisper-small-es | threads=6;provider=cpu;tail=default | on | 470 | 3601 | 2564/2504 | 135 | 3848 | 6553 | 7857 | 0.806 | 0.158 | 0.394 | 0.074 | 0.201 | 0 | NONE:34,LANGUAGE:11 | 1→1 |

## realtime-small-t4 (realtime)

Pixel 10 Pro Fold Tensor G5, Android 17 (SDK 37), bench 3f2e534e802d, sherpa-onnx 1.13.0. 

| Ronda | Modelo | Runtime | Política | Secuencia | Audio s | Ventanas | Descartes | % desc. | Cobertura % | Voz cubierta % | p50 ms | p95 ms | máx ms | Lat. media/máx ms | Entregas | WER | Rechazo idioma | Drenaje OFF ms | Fragm. tarde |
|---:|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|
| 0 | whisper-small-es | threads=4;provider=cpu;tail=default | ref-6-3 | stream-es | 70.1 | 24 | 7 | 29.2 | 98.6 | 100 | 2911 | 4299 | 4299 | 2771/4303 | 15 | 0.310 | 2 | 307 | 0 |
| 0 | whisper-small-es | threads=4;provider=cpu;tail=default | ref-6-3 | stream-ca | 79.9 | 27 | 9 | 33.3 | 97.8 | 100 | 2960 | 4512 | 4512 | 3188/4518 | 15 | 0.515 | 3 | 319 | 0 |
| 0 | whisper-small-es | threads=4;provider=cpu;tail=default | ref-6-3 | stream-level-es | 34.7 | 12 | 5 | 41.7 | 95.8 | 100 | 3627 | 4922 | 4922 | 3157/4008 | 5 | 0.391 | 2 | 361 | 0 |
| 0 | whisper-small-es | threads=4;provider=cpu;tail=default | ref-6-3 | stream-mixed-es-ca | 54.1 | 19 | 7 | 36.8 | 99.8 | 100 | 3343 | 4590 | 4590 | 3016/4161 | 9 | 0.340 | 3 | 319 | 0 |
| 1 | whisper-small-es | threads=4;provider=cpu;tail=default | coalesce-6-3-max12 | stream-es | 70.1 | 22 | 0 | 0 | 99.3 | 100 | 2880 | 4951 | 5216 | 3042/4008 | 16 | 0.159 | 2 | 305 | 0 |
| 1 | whisper-small-es | threads=4;provider=cpu;tail=default | coalesce-6-3-max12 | stream-ca | 79.9 | 20 | 0 | 0 | 97.1 | 100 | 3799 | 5709 | 6536 | 4240/6544 | 16 | 0.799 | 2 | 371 | 0 |
| 1 | whisper-small-es | threads=4;provider=cpu;tail=default | coalesce-6-3-max12 | stream-level-es | 34.7 | 9 | 0 | 0 | 95.5 | 100 | 3684 | 5579 | 5579 | 3996/4719 | 6 | 0.453 | 2 | 340 | 0 |
| 1 | whisper-small-es | threads=4;provider=cpu;tail=default | coalesce-6-3-max12 | stream-mixed-es-ca | 54.1 | 12 | 0 | 0 | 98.8 | 100 | 4792 | 6573 | 6573 | 4713/6579 | 10 | 0.690 | 2 | 393 | 0 |
| 2 | whisper-small-es | threads=4;provider=cpu;tail=default | coalesce-6-3-max12 | stream-es | 70.1 | 21 | 0 | 0 | 97.6 | 100 | 2902 | 4401 | 4645 | 3093/4408 | 17 | 0.195 | 1 | 350 | 0 |
| 2 | whisper-small-es | threads=4;provider=cpu;tail=default | coalesce-6-3-max12 | stream-ca | 79.9 | 20 | 0 | 0 | 97.3 | 100 | 3776 | 5508 | 5533 | 4211/5541 | 16 | 0.567 | 2 | 407 | 0 |
| 2 | whisper-small-es | threads=4;provider=cpu;tail=default | coalesce-6-3-max12 | stream-level-es | 34.7 | 8 | 0 | 0 | 100 | 100 | 4984 | 5706 | 5706 | 4805/5239 | 6 | 0.656 | 2 | 409 | 0 |
| 2 | whisper-small-es | threads=4;provider=cpu;tail=default | coalesce-6-3-max12 | stream-mixed-es-ca | 54.1 | 12 | 0 | 0 | 98.7 | 100 | 5058 | 6473 | 6473 | 4706/6479 | 10 | 0.520 | 2 | 406 | 0 |
| 3 | whisper-small-es | threads=4;provider=cpu;tail=default | ref-6-3 | stream-es | 70.1 | 24 | 8 | 33.3 | 98.6 | 100 | 2930 | 5400 | 5400 | 2932/4384 | 14 | 0.212 | 2 | 351 | 0 |
| 3 | whisper-small-es | threads=4;provider=cpu;tail=default | ref-6-3 | stream-ca | 79.9 | 27 | 9 | 33.3 | 97.8 | 100 | 2956 | 4929 | 4929 | 3129/4934 | 15 | 0.433 | 3 | 364 | 0 |
| 3 | whisper-small-es | threads=4;provider=cpu;tail=default | ref-6-3 | stream-level-es | 34.7 | 12 | 5 | 41.7 | 95.8 | 100 | 3657 | 4716 | 4716 | 3235/4234 | 5 | 0.391 | 2 | 371 | 0 |
| 3 | whisper-small-es | threads=4;provider=cpu;tail=default | ref-6-3 | stream-mixed-es-ca | 54.1 | 19 | 5 | 26.3 | 99.8 | 100 | 2965 | 5480 | 5480 | 2987/4969 | 11 | 0.410 | 3 | 395 | 0 |

## sustained-base-t1-t4 (sustained)

Pixel 10 Pro Fold Tensor G5, Android 17 (SDK 37), bench 3f2e534e802d, sherpa-onnx 1.13.0. 

| Ronda | Modelo | Runtime | Política | Secuencia | Audio s | Ventanas | Descartes | % desc. | Cobertura % | Voz cubierta % | p50 ms | p95 ms | máx ms | Lat. media/máx ms | Entregas | WER | Rechazo idioma | Drenaje OFF ms | Fragm. tarde |
|---:|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|
| 0 | whisper-base-es | threads=1;provider=cpu;tail=default | ref-6-3 | sustained-5min | 300.0 | 101 | 0 | 0 | 100 | 100 | 1002 | 1726 | 2167 | 1105/2178 | 83 | 1.309 | 12 | 106 | 0 |
| 1 | whisper-base-es | threads=4;provider=cpu;tail=default | ref-6-3 | sustained-5min | 300.0 | 101 | 0 | 0 | 100 | 100 | 533 | 831 | 937 | 590/950 | 83 | 1.309 | 12 | 117 | 0 |
| 2 | whisper-base-es | threads=4;provider=cpu;tail=default | ref-6-3 | sustained-5min | 300.0 | 101 | 0 | 0 | 100 | 100 | 537 | 828 | 900 | 593/913 | 83 | 1.309 | 12 | 134 | 1 |
| 3 | whisper-base-es | threads=1;provider=cpu;tail=default | ref-6-3 | sustained-5min | 300.0 | 101 | 0 | 0 | 100 | 100 | 893 | 1388 | 1475 | 973/1493 | 83 | 1.309 | 12 | 135 | 1 |

