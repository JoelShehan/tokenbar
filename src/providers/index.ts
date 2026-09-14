import { CodexProvider } from "./CodexProvider";
import { OpenAIApiProvider } from "./OpenAIApiProvider";
import { ProviderManager } from "./ProviderManager";

export const providerManager = new ProviderManager([
  new CodexProvider(),
  new OpenAIApiProvider(),
]);
