import streamDeck from "@elgato/streamdeck";
import { KrakenPriceTicker } from "./actions/kraken-price-ticker";

// Register the action
streamDeck.actions.registerAction(new KrakenPriceTicker());

// Connect to the Stream Deck application
streamDeck.connect();
