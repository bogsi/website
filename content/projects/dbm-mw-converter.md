---
title: "dBm to mW Converter for Wireless Networking"
date: 2026-11-20
draft: false
description: "A small browser tool that converts between dBm and milliwatts and explains each result for wireless link work"
tags: ["wireless", "networking", "rf", "tools"]
categories: ["Tools"]
---

When you work with Wi-Fi or other wireless links, power is often quoted in dBm, a logarithmic scale referenced to 1 milliwatt. Converting between dBm and milliwatts by hand is error-prone, so I built a small tool that does the conversion both ways and explains what the result means.

**[Open the dBm ↔ mW converter](/tools/dbm-mw-converter/)**

## The formulas

The conversion uses two formulas:

- mW = 10^(dBm / 10)
- dBm = 10 × log10(mW)

Because the scale is logarithmic, a few rules of thumb cover most situations:

- 0 dBm equals 1 mW.
- Adding 3 dB roughly doubles power, and subtracting 3 dB roughly halves it.
- Adding 10 dB multiplies power by 10, and subtracting 10 dB divides it by 10.

Since dBm is logarithmic, a power of zero or less has no dBm value, and the tool rejects it.

## Reference values

| dBm | mW |
|-----|----|
| −90 | 1 pW |
| −60 | 1 nW |
| −30 | 1 µW (0.001 mW) |
| 0 | 1 mW |
| 10 | 10 mW |
| 20 | 100 mW |
| 30 | 1 W |

The ranges in the tool's explanation panel are approximate. Transmit power limits and receiver sensitivity depend on the country, frequency band, and data rate, so check your device datasheet and local regulations before relying on them.
