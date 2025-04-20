import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { docClient } from '../utils/dynamoDBClient';
import { PutCommand, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const router = express.Router();

const actions = ['login', 'logout', 'view', 'edit', 'delete', 'create'];
const locations = ['New York', 'Delhi', 'London', 'Sydney', 'Tokyo'];
const devices = ['Chrome', 'Firefox', 'Edge', 'Safari', 'Mobile App'];

router.post('/bulk', async (req, res) => {
    const total = parseInt(req.query.count as string) || 1000;

    const startId = parseInt(req.query.startId as string) || 1;
  
    console.log(`🟡 Bulk insert of ${total} records starting from ID ${startId}`);
  
    try {
      const records = Array.from({ length: total }).map((_, i) => {
        const recordId = `rec-${String(startId + i).padStart(7, '0')}`;
        const userId = `user-${Math.floor(Math.random() * 5) + 1}`;
        const record = {
          recordId,
          userId,
          action: actions[Math.floor(Math.random() * actions.length)],
          timestamp: new Date().toISOString(),
          staticKey: 'all',  // Added staticKey field here
          metadata: {
            sessionId: uuidv4(),
            location: locations[Math.floor(Math.random() * locations.length)],
            device: devices[Math.floor(Math.random() * devices.length)],
          },
        };
        console.log('📝 Generated Record:', record);
        return record;
      });
  
      const writePromises = records.map(record =>
        docClient.send(new PutCommand({
          TableName: 'ActivityRecordsV2',
          Item: record,
        }))
      );
  
      await Promise.all(writePromises);
      res.status(201).json({ message: `${records.length} records inserted.` });
    } catch (err) {
      console.error('🔥 Bulk insert failed:', err);
      res.status(500).json({ error: 'Failed to insert records.' });
    }
  });

// GET /api/activity-records?limit=50&lastTimestamp=2025-04-13T14:32:38.609Z
router.get('/', async (req, res) => {
    const { limit = 50, lastTimestamp, recordId } = req.query;
  
    const parsedLimit = Number(limit);
    if (isNaN(parsedLimit) || parsedLimit <= 0) {
      return res.status(400).json({ error: 'Invalid limit parameter' });
    }
  
    const params: any = {
      TableName: 'ActivityRecordsV2',
      IndexName: 'staticKey-timestamp-index',
      KeyConditionExpression: 'staticKey = :staticKey',
      ExpressionAttributeValues: {
        ':staticKey': 'all',
      },
      Limit: parsedLimit,
      ScanIndexForward: true,
    };
  
    if (lastTimestamp && recordId) {
      if (typeof lastTimestamp === 'string' && typeof recordId === 'string') {
        params.ExclusiveStartKey = {
          staticKey: 'all',
          timestamp: lastTimestamp,
          recordId: recordId, // Required by the base table's primary key
        };
      } else {
        return res.status(400).json({ error: 'Invalid lastTimestamp or recordId' });
      }
    }
  
    try {
      const data = await docClient.send(new QueryCommand(params));
  
      let nextPageKey = null;
      if (data.LastEvaluatedKey) {
        nextPageKey = {
          recordId: data.LastEvaluatedKey.recordId,
          timestamp: data.LastEvaluatedKey.timestamp,
        };
      }
      console.log('toal results -: ', data?.Items?.length ?? ':(')
    console.log('data -: ', data)
      res.json({
        items: data.Items,
        nextPageKey,
      });
    } catch (err) {
      console.error('Query failed:', err);
      res.status(500).json({ error: 'Failed to fetch activity records' });
    }
  });
  
  
// GET /api/activity-records/filter?userId=user-3&action=view&device=Chrome
router.get('/filter', async (req, res) => {
    const { userId, action, device } = req.query;
  
    let filterExpression = '';
    const expressionAttributeValues: any = {
      ':staticKey': 'all',
    };
    const expressionAttributeNames: any = {}; // to alias reserved keywords
  
    if (userId) {
      filterExpression += '#userId = :userId';
      expressionAttributeNames['#userId'] = 'userId';
      expressionAttributeValues[':userId'] = userId;
    }
  
    if (action) {
      if (filterExpression) filterExpression += ' AND ';
      filterExpression += '#action = :action';
      expressionAttributeNames['#action'] = 'action'; // alias 'action'
      expressionAttributeValues[':action'] = action;
    }
  
    if (device) {
      if (filterExpression) filterExpression += ' AND ';
      filterExpression += 'metadata.device = :device';
      expressionAttributeValues[':device'] = device;
    }
  
    const params: any = {
      TableName: 'ActivityRecordsV2',
      IndexName: 'staticKey-timestamp-index',
      KeyConditionExpression: 'staticKey = :staticKey',
      ExpressionAttributeValues: expressionAttributeValues,
      FilterExpression: filterExpression || undefined,
      ExpressionAttributeNames:
        Object.keys(expressionAttributeNames).length > 0
          ? expressionAttributeNames
          : undefined,
      ScanIndexForward: false, // Optional: newest first
    };
  
    try {
      const data = await docClient.send(new QueryCommand(params));
      res.json({ items: data.Items });
    } catch (err) {
      console.error('Filter fetch failed:', err);
      res.status(500).json({ error: 'Failed to filter records' });
    }
  });

// Get All Records using filters + pagination
  router.get('/records', async (req, res) => {
  const { userId, action, device, limit = '10', lastKey } = req.query;

  let filterExpression = '';
  const expressionAttributeValues: any = {
    ':staticKey': 'all',
  };
  const expressionAttributeNames: any = {};

  // Add filters dynamically
  if (userId) {
    filterExpression += '#userId = :userId';
    expressionAttributeValues[':userId'] = userId;
    expressionAttributeNames['#userId'] = 'userId';
  }

  if (action) {
    if (filterExpression) filterExpression += ' AND ';
    filterExpression += '#action = :action';
    expressionAttributeValues[':action'] = action;
    expressionAttributeNames['#action'] = 'action';
  }

  if (device) {
    if (filterExpression) filterExpression += ' AND ';
    filterExpression += 'metadata.device = :device';
    expressionAttributeValues[':device'] = device;
  }

  const params: any = {
    TableName: 'ActivityRecordsV2',
    IndexName: 'staticKey-timestamp-index',
    KeyConditionExpression: 'staticKey = :staticKey',
    ExpressionAttributeValues: expressionAttributeValues,
    FilterExpression: filterExpression || undefined,
    ExpressionAttributeNames:
      Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
    ScanIndexForward: false,
    Limit: parseInt(limit as string),
    ExclusiveStartKey: lastKey ? JSON.parse(decodeURIComponent(lastKey as string)) : undefined,
  };

  console.log('params -:', params)

  try {
    const data = await docClient.send(new QueryCommand(params));

    res.json({
      items: data.Items,
      nextKey: data.LastEvaluatedKey
        ? encodeURIComponent(JSON.stringify(data.LastEvaluatedKey))
        : null,
    });
  } catch (err) {
    console.error('❌ DynamoDB filter fetch failed:', err);
    res.status(500).json({ error: 'Failed to fetch records from DynamoDB' });
  }
});
  

export default router;
