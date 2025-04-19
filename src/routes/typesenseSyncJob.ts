import express from 'express';
import fs from 'fs'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, ScanCommandOutput } from '@aws-sdk/lib-dynamodb';
import typesense from '../utils/typesenseClient';

const router = express.Router();

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

router.get('/typesense-records', async (req, res) => {
    try {
      const results = await typesense
        .collections('activity_records') // your collection name
        .documents()
        .search({
          q: '*',
          query_by: 'recordId',
          per_page: 10,
          sort_by: 'timestamp:desc', // optional: sort by timestamp
        });
  
      res.status(200).json(results);
    } catch (err) {
      console.error('❌ Error fetching records from Typesense:', err);
      res.status(500).json({ message: 'Failed to fetch records from Typesense' });
    }
  });

  router.post('/typesense-index', async (req, res) => {
    const TableName = 'ActivityRecordsV2';
    let ExclusiveStartKey;
    let totalIndexed = 0;
    let totalFailed = 0;
    const failedRecordIds: string[] = [];
  
    try {
      console.log('📦 Starting bulk indexing into Typesense...');
  
      do {
        const scanResult: ScanCommandOutput = await docClient.send(
          new ScanCommand({
            TableName,
            ExclusiveStartKey,
            Limit: 500, // Adjust batch size based on performance
          })
        );
  
        const items = scanResult.Items || [];
  
        // Prepare JSONL lines
        const jsonlPayload = items
          .map((item: any) => {
            const record = {
              recordId: item.recordId,
              timestamp: new Date(item.timestamp).getTime(),
              action: item.action,
              userId: item.userId,
              staticKey: item.staticKey,
              device: item.metadata?.device,
              location: item.metadata?.location,
              sessionId: item.metadata?.sessionId
            };
  
            if (!record.recordId || !record.timestamp) {
              failedRecordIds.push(record.recordId || '[undefined]');
              return null; // skip bad record
            }
  
            return JSON.stringify(record);
          })
          .filter(Boolean) // remove nulls
          .join('\n');
  
        if (!jsonlPayload) continue;
  
        // Bulk import to Typesense
        const importResult = await typesense
          .collections('activity_records')
          .documents()
          .import(jsonlPayload, { action: 'upsert' });
  
        // Check result line by line
        importResult
          .split('\n')
          .map(line => JSON.parse(line))
          .forEach((r, i) => {
            if (!r.success) {
              const failedId = items[i]?.recordId?.S;
              failedRecordIds.push(failedId || '[undefined]');
              totalFailed++;
            } else {
              totalIndexed++;
            }
          });
  
        // Log progress
        console.log(`✅ Indexed: ${totalIndexed}, ❌ Failed: ${totalFailed}`);
        const used = process.memoryUsage();
        console.log(
          `📊 Memory used: ${(used.heapUsed / 1024 / 1024).toFixed(2)} MB`
        );
  
        ExclusiveStartKey = scanResult.LastEvaluatedKey;
      } while (ExclusiveStartKey);
  
      // Write failed IDs to a file
      if (failedRecordIds.length > 0) {
        fs.writeFileSync(
          'failed-records.json',
          JSON.stringify(failedRecordIds, null, 2)
        );
        console.warn(`⚠️ ${failedRecordIds.length} records failed and written to failed-records.json`);
      }
  
      res.status(200).json({
        message: `✅ Indexed ${totalIndexed} records. ❌ ${totalFailed} failed.`,
      });
    } catch (err) {
      console.error('❌ Fatal error during indexing:', err);
      res.status(500).json({ message: 'Indexing failed', error: err });
    }
  });
export default router;
