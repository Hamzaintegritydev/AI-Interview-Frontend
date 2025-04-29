import React, { useState, useEffect, useRef } from 'react';
import {
  Container, Box, Typography, Button, Select, MenuItem,
  FormControl, InputLabel, TextField, Avatar, CircularProgress,
  Card, CardContent, Chip, Divider, IconButton, Grid
} from '@mui/material';
import {
  Mic, MicOff, Videocam, VideocamOff,
  ScreenShare, StopScreenShare, ExitToApp
} from '@mui/icons-material';
import axios from 'axios';
import './App.css';

function App() {
  const [jobPosition, setJobPosition] = useState('');
  const [experienceLevel, setExperienceLevel] = useState('');
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [isInterviewActive, setIsInterviewActive] = useState(false);
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [remainingTime, setRemainingTime] = useState(10);
  const [interviewComplete, setInterviewComplete] = useState(false);
  const [evaluation, setEvaluation] = useState(null);
  const [stream, setStream] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [audioQueue, setAudioQueue] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);

  const userVideoRef = useRef(null);
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const audioRef = useRef(new Audio());

  // Audio play functionality
  useEffect(() => {
    const playNextInQueue = () => {
      if (audioQueue.length > 0 && !isPlaying) {
        setIsPlaying(true);
        const nextAudio = audioQueue[0];
        
        // Convert base64 to blob
        const audioBlob = base64ToBlob(nextAudio, 'audio/mpeg');
        const audioUrl = URL.createObjectURL(audioBlob);
        
        audioRef.current.src = audioUrl;
        audioRef.current.play().catch(e => console.error("Audio playback error:", e));
      }
    };

    playNextInQueue();
  }, [audioQueue, isPlaying]);

  // Handle audio ending
  useEffect(() => {
    const handleAudioEnd = () => {
      // Remove the played audio from queue
      setAudioQueue(prev => {
        const newQueue = [...prev];
        newQueue.shift();
        return newQueue;
      });
      
      setIsPlaying(false);
      
      // If in interview, start listening after audio finishes
      if (isInterviewActive && !interviewComplete) {
        startListening();
      }
    };

    audioRef.current.addEventListener('ended', handleAudioEnd);
    
    return () => {
      audioRef.current.removeEventListener('ended', handleAudioEnd);
    };
  }, [isInterviewActive, interviewComplete]);

  // Helper for base64 to blob conversion
  const base64ToBlob = (base64, type) => {
    const binaryString = window.atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new Blob([bytes], { type: type });
  };

  // Scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Interview Timer
  useEffect(() => {
    if (isInterviewActive && remainingTime > 0) {
      const timer = setInterval(() => {
        setRemainingTime(prev => {
          const newTime = parseFloat((prev - 0.1).toFixed(1));
          if (newTime <= 0) {
            clearInterval(timer);
            completeInterview();
            return 0;
          }
          return newTime;
        });
      }, 6000);

      return () => clearInterval(timer);
    }
  }, [isInterviewActive, remainingTime]);

  // Setup Speech Recognition
  useEffect(() => {
    if (window.webkitSpeechRecognition || window.SpeechRecognition) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = async (event) => {
        const last = event.results.length - 1;
        const transcript = event.results[last][0].transcript.trim();
        
        setUserInput(transcript);
        
        if (transcript && isInterviewActive) {
          // Temporarily stop listening while processing
          recognitionRef.current.stop();
          setIsListening(false);
          
          setMessages(prev => [...prev, {
            type: 'candidate',
            text: transcript,
            timestamp: new Date()
          }]);
          
          try {
            setIsLoading(true);
            const response = await axios.post('http://localhost:5000/process-answer', {
              answer: transcript
            });
            setIsLoading(false);
            
            if (response.data.isComplete) {
              // Add the final message
              setMessages(prev => [...prev, {
                type: 'interviewer',
                text: response.data.message,
                timestamp: new Date()
              }]);
              
              // Queue the audio
              if (response.data.audio) {
                setAudioQueue(prev => [...prev, response.data.audio]);
              }
              
              completeInterview();
            } else {
              setMessages(prev => [...prev, {
                type: 'interviewer',
                text: response.data.question,
                timestamp: new Date()
              }]);
              setRemainingTime(parseFloat(response.data.remainingTime));
              
              // Queue the audio response
              if (response.data.audio) {
                setAudioQueue(prev => [...prev, response.data.audio]);
              }
              
              // Let the audio system handle resuming listening
            }
          } catch (err) {
            console.error("Error sending answer:", err);
            setIsLoading(false);
            // Resume listening even if there was an error
            if (isInterviewActive && !interviewComplete) {
              startListening();
            }
          }
        }
      };

      recognitionRef.current.onerror = (e) => {
        console.error('Speech recognition error:', e.error);
        setIsListening(false);
        
        // Handle specific error cases
        if (e.error === 'no-speech') {
          console.warn("No speech detected, restarting recognition...");
          setTimeout(startListening, 1000); // Restart after 1 second
        } else {
          // Restart recognition for other errors
          if (isInterviewActive && !interviewComplete) {
            setTimeout(() => {
              console.log("Restarting speech recognition due to error...");
              startListening();
            }, 1000);
          }
        }
      };
      
      recognitionRef.current.onend = () => {
        setIsListening(false);
        
        // Restart if it ends unexpectedly
        if (isInterviewActive && !interviewComplete) {
          console.log("Speech recognition ended, restarting...");
          setTimeout(startListening, 1000);
        }
      };
    }
  }, [isInterviewActive, interviewComplete, isPlaying]);

  const startListening = () => {
    if (recognitionRef.current && !isListening && !isPlaying && isMicOn) {
      try {
        recognitionRef.current.start();
        setIsListening(true);
        setUserInput('');
      } catch (err) {
        console.warn("Failed to start recognition:", err);
      }
    }
  };

  // Start Interview
  const startInterview = async () => {
    if (!jobPosition || !experienceLevel) return alert("Select both fields");

    setIsLoading(true);

    try {
      const response = await axios.post('http://localhost:5000/start-interview', {
        jobPosition, experienceLevel
      });

      setIsSetupComplete(true);
      setIsInterviewActive(true);
      setRemainingTime(10);

      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setStream(mediaStream);
        if (userVideoRef.current) userVideoRef.current.srcObject = mediaStream;
      } catch (mediaError) {
        console.warn("Webcam not accessible or permission denied:", mediaError);
      }

      setMessages([
        {
          type: 'interviewer',
          text: `Welcome to the ${jobPosition} interview.`,
          timestamp: new Date()
        },
        {
          type: 'interviewer',
          text: response.data.question,
          timestamp: new Date()
        }
      ]);
      
      // Queue the audio response
      if (response.data.audio) {
        setAudioQueue([response.data.audio]);
      }
    } catch (err) {
      alert("Error starting interview");
    } finally {
      setIsLoading(false);
    }
  };

  const completeInterview = async () => {
    if (interviewComplete) return;
    setIsInterviewActive(false);
    setInterviewComplete(true);
    setIsLoading(true);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (err) {
        console.warn("Error stopping recognition:", err);
      }
    }

    try {
      const res = await axios.post('http://localhost:5000/complete-interview');
      setEvaluation(res.data.evaluation);
      setMessages(prev => [...prev, {
        type: 'interviewer',
        text: 'Thank you for the interview!',
        timestamp: new Date()
      }]);
      
      // Queue the thank you audio
      if (res.data.audio) {
        setAudioQueue(prev => [...prev, res.data.audio]);
      }
    } catch (err) {
      console.error('Completion error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleVideo = () => {
    if (stream) {
      const videoTracks = stream.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoOn(!isVideoOn);
    }
  };

  const toggleMic = () => {
    if (stream) {
      const audioTracks = stream.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMicOn(!isMicOn);
    }
  };

  const formatTime = (minutes) => {
    const mins = Math.floor(minutes);
    const secs = Math.floor((minutes - mins) * 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#f5f5f5' }}>
      {/* Header */}
      <Box sx={{ bgcolor: '#202124', color: 'white', p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6" sx={{ fontWeight: 'bold' }}>AI Interview Platform</Typography>
        {isSetupComplete && (
          <Chip 
            label={`Time: ${formatTime(remainingTime)}`} 
            sx={{ 
              bgcolor: remainingTime <= 1 ? '#d32f2f' : '#3f51b5',
              color: 'white',
              fontWeight: 'bold'
            }} 
          />
        )}
      </Box>

      {!isSetupComplete ? (
        <Box sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flexGrow: 1,
          p: 3,
          maxWidth: 600,
          margin: '0 auto'
        }}>
          <Card sx={{ width: '100%', p: 3, boxShadow: 3 }}>
            <CardContent>
              <Typography variant="h5" gutterBottom sx={{ fontWeight: 'bold', textAlign: 'center', mb: 3 }}>
                Start Your AI Interview
              </Typography>
              
              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel>Job Position</InputLabel>
                <Select 
                  value={jobPosition} 
                  label="Job Position" 
                  onChange={(e) => setJobPosition(e.target.value)}
                >
                  <MenuItem value="Software Engineer">Software Engineer</MenuItem>
                  <MenuItem value="Data Scientist">Data Scientist</MenuItem>
                  <MenuItem value="Product Manager">Product Manager</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth sx={{ mb: 4 }}>
                <InputLabel>Experience Level</InputLabel>
                <Select 
                  value={experienceLevel} 
                  label="Experience Level" 
                  onChange={(e) => setExperienceLevel(e.target.value)}
                >
                  <MenuItem value="Entry-level">Entry-level</MenuItem>
                  <MenuItem value="Mid-level">Mid-level</MenuItem>
                  <MenuItem value="Senior">Senior</MenuItem>
                </Select>
              </FormControl>

              <Button 
                variant="contained" 
                onClick={startInterview} 
                disabled={isLoading}
                fullWidth
                size="large"
                sx={{ py: 1.5 }}
              >
                {isLoading ? <CircularProgress size={24} color="inherit" /> : 'Start Interview'}
              </Button>
            </CardContent>
          </Card>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>
          {/* Main Video Area */}
          <Box sx={{ 
            flexGrow: 1, 
            display: 'flex', 
            flexDirection: 'column', 
            p: 2,
            position: 'relative'
          }}>
            {/* AI Interviewer Video */}
            <Box sx={{
              flexGrow: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: '#202124',
              borderRadius: 2,
              mb: 2,
              position: 'relative',
              overflow: 'hidden'
            }}>
              <Avatar 
                src="/ai-avatar.png" 
                sx={{ 
                  width: 150, 
                  height: 150,
                  bgcolor: '#3f51b5'
                }} 
              />
              {isPlaying && (
                <Box sx={{
                  position: 'absolute',
                  bottom: 16,
                  left: 16,
                  bgcolor: 'rgba(0,0,0,0.7)',
                  color: 'white',
                  px: 1.5,
                  py: 0.5,
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center'
                }}>
                  <Box sx={{
                    width: 8,
                    height: 8,
                    bgcolor: 'red',
                    borderRadius: '50%',
                    mr: 1,
                    animation: 'pulse 1.5s infinite'
                  }} />
                  <Typography variant="caption">AI Speaking</Typography>
                </Box>
              )}
            </Box>

            {/* User Video */}
            <Box sx={{
              position: 'absolute',
              bottom: 80,
              right: 20,
              width: 180,
              height: 135,
              bgcolor: 'black',
              borderRadius: 2,
              overflow: 'hidden',
              border: '2px solid #3f51b5',
              zIndex: 10
            }}>
              {isVideoOn ? (
                <video
                  ref={userVideoRef}
                  autoPlay
                  muted
                  playsInline
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <Box sx={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: '#121212'
                }}>
                  <Avatar sx={{ width: 60, height: 60 }} />
                </Box>
              )}
            </Box>

            {/* Controls */}
            <Box sx={{
              display: 'flex',
              justifyContent: 'center',
              bgcolor: '#202124',
              borderRadius: 2,
              p: 1.5,
              mt: 'auto'
            }}>
             
              
              <Button 
                variant="contained" 
                color="error" 
                startIcon={<ExitToApp />}
                onClick={completeInterview}
                sx={{ ml: 2 }}
              >
                End Interview
              </Button>
            </Box>
          </Box>

          {/* Chat Panel */}
          <Box sx={{ 
            width: 350, 
            bgcolor: 'white', 
            display: 'flex', 
            flexDirection: 'column',
            borderLeft: '1px solid #e0e0e0'
          }}>
            <Box sx={{ 
              p: 2, 
              borderBottom: '1px solid #e0e0e0',
              bgcolor: '#f9f9f9'
            }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                Interview Chat
              </Typography>
            </Box>
            
            <Box sx={{ 
              flexGrow: 1, 
              overflowY: 'auto', 
              p: 2,
              bgcolor: '#f5f5f5'
            }}>
              {messages.map((msg, index) => (
                <Box 
                  key={index} 
                  sx={{ 
                    mb: 2,
                    display: 'flex',
                    flexDirection: msg.type === 'interviewer' ? 'row' : 'row-reverse'
                  }}
                >
                  <Avatar 
                    sx={{ 
                      width: 32, 
                      height: 32,
                      bgcolor: msg.type === 'interviewer' ? '#3f51b5' : '#4caf50',
                      mr: msg.type === 'interviewer' ? 1 : 0,
                      ml: msg.type === 'interviewer' ? 0 : 1
                    }}
                  >
                    {msg.type === 'interviewer' ? 'AI' : 'Y'}
                  </Avatar>
                  <Box>
                    <Box sx={{
                      bgcolor: msg.type === 'interviewer' ? 'white' : '#e3f2fd',
                      p: 1.5,
                      borderRadius: 2,
                      boxShadow: 1,
                      maxWidth: 250
                    }}>
                      <Typography variant="body2">{msg.text}</Typography>
                    </Box>
                    <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 0.5 }}>
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Typography>
                  </Box>
                </Box>
              ))}
              <div ref={messagesEndRef} />
            </Box>
            
            {/* Input Area */}
            <Box sx={{ 
              p: 2, 
              borderTop: '1px solid #e0e0e0',
              bgcolor: '#f9f9f9'
            }}>
              <TextField
                fullWidth
                placeholder={isListening ? "Listening... Speak your answer aloud." : isPlaying ? "AI is speaking..." : "Processing..."}
                value={userInput}
                InputProps={{ 
                  readOnly: true,
                  sx: { bgcolor: 'white' }
                }}
              />
              <Typography variant="caption" color={isListening ? "primary" : isPlaying ? "secondary" : "textSecondary"} sx={{ mt: 1, display: 'block' }}>
                {isListening ? "Microphone active - speak clearly" : isPlaying ? "AI is speaking" : isLoading ? "Processing your answer..." : "Waiting..."}
              </Typography>
            </Box>
          </Box>
        </Box>
      )}

      {/* Evaluation Modal */}
      {interviewComplete && evaluation && (
  <Box sx={{
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    bgcolor: 'rgba(0,0,0,0.8)',
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  }}>
    <Card sx={{ 
      width: '90%', 
      maxWidth: 900,
      maxHeight: '90vh',
      overflowY: 'auto'
    }}>
      <CardContent sx={{ p: 4 }}>
        <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold', mb: 3, color: '#3f51b5' }}>
          Interview Evaluation
        </Typography>
        
        {/* Header Section */}
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          mb: 4,
          p: 3,
          bgcolor: '#f5f5f5',
          borderRadius: 2,
          boxShadow: 1
        }}>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6">
              <strong>Position:</strong> {jobPosition} ({experienceLevel})
            </Typography>
            <Typography variant="h6" sx={{ mt: 1 }}>
              <strong>Overall Score:</strong> {evaluation.score}/10
            </Typography>
            <Typography variant="h6" sx={{ mt: 1 }}>
              <strong>Recommendation:</strong> {evaluation.recommendation}
            </Typography>
          </Box>
          <Box sx={{
            width: 120,
            height: 120,
            borderRadius: '50%',
            bgcolor: 
              evaluation.score >= 8 ? '#4caf50' : 
              evaluation.score >= 6 ? '#8bc34a' : 
              evaluation.score >= 4 ? '#ff9800' : '#f44336',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 3
          }}>
            <Typography variant="h3" sx={{ color: 'white', fontWeight: 'bold' }}>
              {evaluation.score}
            </Typography>
          </Box>
        </Box>
        
        {/* Overall Feedback */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 2, color: '#3f51b5' }}>
            Overall Feedback
          </Typography>
          <Card variant="outlined" sx={{ p: 2 }}>
            <Typography variant="body1">{evaluation.feedback}</Typography>
          </Card>
        </Box>
        
        {/* Development Plan */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 2, color: '#3f51b5' }}>
            Development Plan
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {evaluation.developmentPlan?.map((plan, i) => (
              <Card key={i} variant="outlined" sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                  <Box sx={{ 
                    width: 30, 
                    height: 30, 
                    borderRadius: '50%', 
                    bgcolor: '#3f51b5', 
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mr: 2,
                    fontWeight: 'bold'
                  }}>
                    {i+1}
                  </Box>
                  <Typography variant="body1">{plan}</Typography>
                </Box>
              </Card>
            ))}
          </Box>
        </Box>
        
        <Divider sx={{ my: 4 }} />
        
        {/* Detailed Assessment Grid */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          {/* Technical Assessment */}
          <Grid item xs={12} md={6}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Typography variant="h6" color="primary" sx={{ fontWeight: 'bold' }}>
                    Technical Skills
                  </Typography>
                  <Chip 
                    label={`${evaluation.technicalAssessment?.score || 0}/10`}
                    color={
                      (evaluation.technicalAssessment?.score || 0) >= 7 ? "success" : 
                      (evaluation.technicalAssessment?.score || 0) >= 5 ? "warning" : "error"
                    }
                  />
                </Box>
                <Typography variant="body2">{evaluation.technicalAssessment?.analysis}</Typography>
              </CardContent>
            </Card>
          </Grid>
          
          {/* Communication Assessment */}
          <Grid item xs={12} md={6}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Typography variant="h6" color="primary" sx={{ fontWeight: 'bold' }}>
                    Communication Skills
                  </Typography>
                  <Chip 
                    label={`${evaluation.communicationAssessment?.score || 0}/10`}
                    color={
                      (evaluation.communicationAssessment?.score || 0) >= 7 ? "success" : 
                      (evaluation.communicationAssessment?.score || 0) >= 5 ? "warning" : "error"
                    }
                  />
                </Box>
                <Typography variant="body2">{evaluation.communicationAssessment?.analysis}</Typography>
              </CardContent>
            </Card>
          </Grid>
          
          {/* Cultural Fit Assessment */}
          <Grid item xs={12} md={6}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Typography variant="h6" color="primary" sx={{ fontWeight: 'bold' }}>
                    Cultural Fit
                  </Typography>
                  <Chip 
                    label={`${evaluation.culturalFitAssessment?.score || 0}/10`}
                    color={
                      (evaluation.culturalFitAssessment?.score || 0) >= 7 ? "success" : 
                      (evaluation.culturalFitAssessment?.score || 0) >= 5 ? "warning" : "error"
                    }
                  />
                </Box>
                <Typography variant="body2">{evaluation.culturalFitAssessment?.analysis}</Typography>
              </CardContent>
            </Card>
          </Grid>
          
          {/* Problem Solving Assessment */}
          <Grid item xs={12} md={6}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Typography variant="h6" color="primary" sx={{ fontWeight: 'bold' }}>
                    Problem Solving
                  </Typography>
                  <Chip 
                    label={`${evaluation.problemSolvingAssessment?.score || 0}/10`}
                    color={
                      (evaluation.problemSolvingAssessment?.score || 0) >= 7 ? "success" : 
                      (evaluation.problemSolvingAssessment?.score || 0) >= 5 ? "warning" : "error"
                    }
                  />
                </Box>
                <Typography variant="body2">{evaluation.problemSolvingAssessment?.analysis}</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
        
        <Divider sx={{ my: 4 }} />
        
        {/* Strengths and Improvement Areas */}
        <Box sx={{ mb: 4 }}>
          <Grid container spacing={3}>
            {/* Strengths */}
            <Grid item xs={12} md={6}>
              <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 2, color: '#4caf50' }}>
                Key Strengths
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {evaluation.strengths?.map((item, i) => (
                  <Card key={i} variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: '#4caf50' }}>
                      {item.strength || item}
                    </Typography>
                    {item.example && (
                      <Typography variant="body2" sx={{ mt: 1, fontStyle: 'italic' }}>
                        Example: "{item.example}"
                      </Typography>
                    )}
                  </Card>
                ))}
              </Box>
            </Grid>
            
            {/* Improvement Areas */}
            <Grid item xs={12} md={6}>
              <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 2, color: '#f44336' }}>
                Areas for Improvement
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {evaluation.improvementAreas?.map((item, i) => (
                  <Card key={i} variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: '#f44336' }}>
                      {item.area || item}
                    </Typography>
                    {item.example && (
                      <Typography variant="body2" sx={{ mt: 1, fontStyle: 'italic' }}>
                        Example: "{item.example}"
                      </Typography>
                    )}
                  </Card>
                ))}
              </Box>
            </Grid>
          </Grid>
        </Box>
        
        {/* Standout Moments */}
        {evaluation.standoutMoments && evaluation.standoutMoments.length > 0 && (
          <Box sx={{ mb: 4 }}>
            <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 2, color: '#3f51b5' }}>
              Standout Moments
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {evaluation.standoutMoments.map((moment, i) => (
                <Card key={i} variant="outlined" sx={{ 
                  p: 2, 
                  borderLeft: '4px solid', 
                  borderColor: moment.type === 'positive' ? '#4caf50' : moment.type === 'negative' ? '#f44336' : '#9e9e9e' 
                }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                    {moment.moment}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    Impact: {moment.impact}
                  </Typography>
                </Card>
              ))}
            </Box>
          </Box>
        )}
        
        <Button 
          variant="contained" 
          fullWidth 
          sx={{ mt: 4, py: 1.5 }}
          onClick={() => {
            setIsSetupComplete(false);
            setInterviewComplete(false);
            setEvaluation(null);
            setMessages([]);
            setJobPosition('');
            setExperienceLevel('');
            if (stream) {
              stream.getTracks().forEach(track => track.stop());
            }
          }}
        >
          Start New Interview
        </Button>
      </CardContent>
    </Card>
  </Box>
)}
    </Box>
  );
}

export default App;