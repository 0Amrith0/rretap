---
type: knowledge-doc
title: Match Types
topic_key: Match-Types
confidence: Medium
last_updated: 2026-09-08
sources:
  - url: https://www.junglescout.com/resources/articles/amazon-sponsored-product-ads/
    type: blog
    last_checked: 2026-09-02
  - url: https://github.com/amzn/amazon-advertising-api-php-sdk
    type: repo-readme
    last_checked: 2026-09-02
related: [Sponsored-Products, Keyword-Targeting, Campaign-Types, Advertising-API]
disputed: false
---

## Overview

Automatic targeting campaigns for [Sponsored Products](Sponsored-Products.md) use four match types — close match, loose match, substitutes, and complements — that Amazon applies based on how closely a search term or product relates to the advertised item. Manual [keyword targeting](Keyword-Targeting.md) campaigns instead use three match types — broad, phrase, and exact — which give the seller increasing control over how closely a customer's search must match their target keyword. At the [Advertising API](Advertising-API.md) level, biddable keywords use match types such as 'exact', while negative keywords use distinct match types such as 'negativeExact'. These match types apply within whichever of the [campaign types](Campaign-Types.md) a seller is running.

## Facts

- Automatic targeting campaigns for Sponsored Products can use four match types: close match (search terms closely related to the advertised product), loose match (loosely related search terms), substitutes (shoppers considering similar products from a different brand), and complements (shoppers viewing detail pages of complementary products). — [source](https://www.junglescout.com/resources/articles/amazon-sponsored-product-ads/), confidence: Medium, last-checked: 2026-09-02
- Manual Sponsored Products keyword campaigns support three match types: broad match (targeted words can appear in any order with additional words before, after, or between them, plus close variants like plurals), phrase match (the ad appears when the exact target phrase is included in a search, with other words allowed before or after), and exact match (the ad appears only when the customer's search exactly matches the target keyword with no other words). — [source](https://www.junglescout.com/resources/articles/amazon-sponsored-product-ads/), confidence: Medium, last-checked: 2026-09-02
- Biddable keywords in the Amazon Advertising API support match types such as 'exact', while negative keywords use distinct match types such as 'negativeExact'. (stale source) — [source](https://github.com/amzn/amazon-advertising-api-php-sdk), confidence: Low, last-checked: 2026-09-02
