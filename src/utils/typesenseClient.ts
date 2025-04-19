import Typesense from 'typesense';

const typesense = new Typesense.Client({
  nodes: [
    {
      host: 'localhost',
      port: 8108,
      protocol: 'http'
    }
  ],
  apiKey: 'taskflow-collections',
  connectionTimeoutSeconds: 20,
});

export default typesense;
