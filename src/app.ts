import express, { Application, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import cors from "cors";
import userRoutes from './routes/users.routes';
import activityRoutes from './routes/activity.records.routes';
import typesenseRoutes from './routes/typesense.routes'
dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 5000;

// ✅ Enable CORS to allow requests from Next.js (localhost:3000)
app.use(
    cors({
      origin: "http://localhost:3000", // Allow requests from Next.js frontend
      credentials: true, // Allow cookies (for JWT authentication)
    })
  );

app.use(express.json());
app.use(cookieParser());

interface User {
    id: number;
    username: string;
    password?: string;
}

// Mock database
const users: User[] = [{ id: 1, username: 'admin', password: 'password' }];

const generateAccessToken = (user: User): string => {
    return jwt.sign(
        { id: user.id, username: user.username },
        process.env.ACCESS_TOKEN_SECRET as string,
        { expiresIn: '15m' }
    );
};

const generateRefreshToken = (user: User): string => {
    return jwt.sign(
        { id: user.id },
        process.env.REFRESH_TOKEN_SECRET as string,
        { expiresIn: '7d' }
    );
};

app.post('/login', (req: Request, res: Response) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    res.cookie('accessToken', accessToken, { httpOnly: true, secure: true });
    res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: true });

    res.json({ message: 'Logged in successfully' });
});

app.post("/logout", (req, res) => {
    res.clearCookie("accessToken");
    res.json({ message: "Logged out successfully" });
  });

app.post('/refresh', (req: Request, res: Response) => {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) return res.status(403).json({ message: 'No refresh token' });

    jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET as string, (err: jwt.VerifyErrors | null, user: any) => {
        if (err) return res.status(403).json({ message: 'Invalid refresh token' });

        const newAccessToken = generateAccessToken({ id: (user as User).id, username: (user as User).username });
        res.cookie('accessToken', newAccessToken, { httpOnly: true, secure: true });
        res.json({ message: 'Token refreshed' });
    });
});

app.use("/api/users", userRoutes); // Mount the user routes under "/users"
app.use('/api/dynamo', activityRoutes);
app.use('/api/typesense', typesenseRoutes);

// ✅ Test deployment endpoint
app.get("/test", (req: Request, res: Response) => {
    res.json({ number: "001" });
  });
  

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});