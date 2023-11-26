"use client"
import React, { useState, useRef, useEffect } from 'react';
import * as posenet from '@tensorflow-models/posenet';
import * as tf from '@tensorflow/tfjs'
import { drawKeypoints, drawSkeleton } from './utilities';
import Webcam from 'react-webcam';
import RobotImage from './components/RobotImage';

// Custom functions
function saveMinDist(facialLandmarks) {
  
  const leftEye = facialLandmarks.find(landmark => landmark.part === 'leftEye');
  const rightEye = facialLandmarks.find(landmark => landmark.part === 'rightEye');
  const minDist = Math.abs(rightEye.position.x - leftEye.position.x);

  //returns minimum distance
  return minDist;
}

// to check if user is currently closer than minDist
function distanceToScreen(minDist, facialLandmarks) {
  
  const leftEye = facialLandmarks.find(landmark => landmark.part === 'leftEye');
  const rightEye = facialLandmarks.find(landmark => landmark.part === 'rightEye');
  const currentDist = Math.abs(rightEye.position.x - leftEye.position.x);

  if (currentDist <= minDist) {
    return true
  } else {
    return false
  }
}

function isSittingDown(facialLandmarks) {
  
  const leftEye = facialLandmarks.find(landmark => landmark.part === 'leftEye');
  
  //0.6 is max for nose
  //0.15 for eye, its more unique
  if (leftEye.score < 0.15) {
    // console.log(" ")
    // console.log("Score: " +  nose.score)
    return false;
  } else {
    return true;
  }
}

function isFacingCamera(facialLandmarks) {
  const rightEye = facialLandmarks.find(landmark => landmark.part === 'rightEye');
  const leftEye = facialLandmarks.find(landmark => landmark.part === 'leftEye');
  const nose = facialLandmarks.find(landmark => landmark.part === 'nose');
  const rightEar = facialLandmarks.find(landmark => landmark.part === 'rightEar');
  const leftEar = facialLandmarks.find(landmark => landmark.part === 'leftEar');

  // Calculate distances between the eyes and between the ears
  const eyeDistanceHorizontal = Math.abs(rightEye.position.x - leftEye.position.x);
  const earDistance = rightEar && leftEar ? Math.abs(rightEar.position.x - leftEar.position.x) : null;

  // Check if the nose is approximately centered horizontally between the eyes
  const noseHorizontalPosition = (rightEye.position.x + leftEye.position.x) / 2;
  const noseHorizontalOffset = Math.abs(nose.position.x - noseHorizontalPosition);

  // Determine the vertical position of the nose relative to the eyes
  const eyeLevel = (rightEye.position.y + leftEye.position.y) / 2;
  const noseVerticalOffset = Math.abs(nose.position.y - eyeLevel);

  // Define a threshold for how much horizontal and vertical offset is allowed
  // These thresholds can be fine-tuned for sensitivity
  const horizontalOffsetThreshold = eyeDistanceHorizontal * 0.8;
  const verticalOffsetThreshold = eyeDistanceHorizontal*0.4; // Allowing more vertical leeway

  // Check if the person is facing the camera based on the nose position
  // The person can be looking up or down but still be considered facing forward && noseVerticalOffset < verticalOffsetThreshold;
  const isFacingForward = noseHorizontalOffset < horizontalOffsetThreshold;
  return isFacingForward;
  // console.log({horizontal:noseHorizontalOffset < horizontalOffsetThreshold, vertical:noseVerticalOffset < verticalOffsetThreshold})
  // return {horizontal:noseHorizontalOffset < horizontalOffsetThreshold, vertical:noseVerticalOffset < verticalOffsetThreshold};
}

// useEffect(()=>{
//   fetch('/api/hello')
//   .then((response) => response.json())
//   .then((data) => console.log(data));
// // },[])

const Home = () => {
  const [isClicked, setIsClicked] = useState(false);
  const [timeInput, setTimeInput] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false)
  const [timeLeftBreak, setTimeLeftBreak] = useState(0)
  const [timerRunningBreak, setTimerRunningBreak] = useState(false)
  const [timeInputBreak, setTimeInputBreak] = useState('')
  const [textForBot, setTextForBot] = useState('hello I am ErgoBot')

  const videoRef = useRef(null);
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  

//Toggle camera on/off
  const handleClick = () => {
    if (timeInput == ''){
      alert('Input your work time')
    }
    else{
      setIsClicked(!isClicked);
    }
    if (timeInput !== ''){
      setTimeLeft(parseInt(timeInput))
      setTimerRunning(true)
    }
    if (timeInputBreak !== '' && timeLeft === 0 && !timerRunningBreak && !isClicked) {
      setTimeLeftBreak(parseInt(timeInputBreak));
      setTimerRunningBreak(false);
    }
  };

  // Countdown for work timer
  useEffect(() => {
    let workCountdown;

    if (timerRunning && timeLeft > 0 ) {
      workCountdown = setInterval(() => {
        setTimeLeft((prevTime) => prevTime - 1);
      }, 1000);

      return () => clearInterval(workCountdown);
    } else if (timeLeft === 0 && timerRunning) {
      alert('Time for a break!');
      setIsClicked(false);
      setTimerRunning(false);

      // Start the break timer after work time ends
      setTimeLeftBreak(parseInt(timeInputBreak));
      setTimerRunningBreak(true);
    }

    return () => clearInterval(workCountdown);
  }, [timerRunning, timeLeft]);

  // Countdown for break timer
  useEffect(() => {
    let breakCountdown;

    if (timerRunningBreak && timeLeftBreak > 0) {
      breakCountdown = setInterval(() => {
        setTimeLeftBreak((prevTime) => prevTime - 1);
      }, 1000);

      return () => clearInterval(breakCountdown);
    } else if (timeLeftBreak === 0 && timerRunningBreak) {
      alert('Time to work again!');
      setTimerRunningBreak(false);

      // Start the work timer after break time ends
      setTimeLeft(parseInt(timeInput));
      setTimerRunning(false);
    }

    return () => clearInterval(breakCountdown);
  }, [timerRunningBreak, timeLeftBreak]);


  const runPosenet = async () => {
    const net = await posenet.load({
      inputResolution: { width: 640, height: 480 },
      scale: 0.5,
    });
    setInterval(() => {
      detect(net);
    }, 500);
  };
  

  const detect = async (net) => {
    if (
      typeof webcamRef.current !== 'undefined' &&
      webcamRef.current !== null &&
      webcamRef.current.video.readyState === 4
    ) {
      const video = webcamRef.current.video;
      const videoWidth = webcamRef.current.video.videoWidth;
      const videoHeight = webcamRef.current.video.videoHeight;

      webcamRef.current.video.width = videoWidth;
      webcamRef.current.video.height = videoHeight;

      const pose = await net.estimateSinglePose(video);
      // console.log(pose);
      //console.log(isFacingCamera(pose.keypoints));
      console.log(isSittingDown(pose.keypoints));
      drawCanvas(pose, videoWidth, videoHeight);
    }
  };

  const drawCanvas = (pose, videoWidth, videoHeight) => {
    const canvas = canvasRef.current;

    // Check if canvas reference and context are available before accessing them
    if (canvas && canvas.getContext) {
      const ctx = canvas.getContext('2d');
  
      // Check if the context is available before using it
      if (ctx) {
        canvas.width = videoWidth;
        canvas.height = videoHeight;
  
        drawKeypoints(pose['keypoints'], 0.5, ctx);
        drawSkeleton(pose['keypoints'], 0.5, ctx);
      } else {
        console.error('Canvas context not available.');
      }
    } else {
      console.error('Canvas reference not available.');
    }
  };

  useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ video: true })
        .then((stream) => {
          const video = videoRef.current;
          if (video) {
            video.srcObject = stream;
            video.play();
          }
        })
        .catch((err) => {
          console.error('Error accessing the camera:', err);
        });
    }
    runPosenet();
  }, []);

  return (
    <div className='p-4 h-screen bg-zinc-900 flex'>
      <div className=''>
        <p className='ml-40 border mb-4 bg-yellow-700 p-4'>
          Step 1: Set your work time and break time
        </p>
        <p className='ml-40 border mb-4 bg-yellow-700 p-4'>
          Step 2: Turn on your camera to begin your work session
        </p>
      </div>
      <div className='flex flex-col ml-auto space-y-4'>
        {/*off button*/}
        <button
          className={`my-2 px-4 py-2 bg-blue-500 text-white rounded-md ${isClicked ? 'bg-red-700' : 'bg-green-500'
            }`}
          onClick={handleClick}
        >
          {isClicked ? 'Off' : 'On'}
        </button>

        {/*timer*/}
        <input
          type="number"
          placeholder="Enter time in seconds"
          value={timeInput}
          onChange={(e) => setTimeInput(e.target.value)}
          className='my-2 px-4 py-2 bg-yellow-600 text-white rounded-md'
        />
        <div className='mt-auto'>
      {timerRunning ? (
        <div className='my-2 px-4 py-2 bg-yellow-600 text-white rounded-md'>
          Time left: {timeLeft} seconds
        </div>
      ) : (
        <div className='my-2 px-4 py-2 bg-yellow-600 text-white rounded-md'>
          {timeLeft === 0 ?( 'Set your work time') : "Set your work time"}
        </div>
      )}
      </div>
        <input
          type="number"
          placeholder="Enter time in seconds"
          value={timeInputBreak}
          onChange={(e) => setTimeInputBreak(e.target.value)}
          className='my-2 px-4 py-2 bg-yellow-600 text-white rounded-md'
        />
        <div className='mt-auto'>
        {timerRunningBreak ? (
          <div className='my-2 px-4 py-2 bg-yellow-600 text-white rounded-md'>
            Time left: {timeLeftBreak} seconds
          </div>
        ) : (
          <div className='my-2 px-4 py-2 bg-yellow-600 text-white rounded-md'>
            {timeLeftBreak === 0 ? 'Set your break time' : 'Set Your Break time'}
          </div>
        )}
      </div>
      </div>
      {isClicked ? (
        <div className="App">
          <header className="App-header">
          <Webcam
              ref={webcamRef}
              style={{
                position: 'absolute',
                left: 80, // Align to the left
                top: '65%', // Center vertically
                transform: 'translateY(-50%)', // Center vertically
                zIndex: 9,
                width: 640,
                height: 480,
              }}
            />
            <canvas
              ref={canvasRef}
              style={{
                position: 'absolute',
                left: 80, // Align to the left
                top: '65%', // Center vertically
                transform: 'translateY(-50%)', // Center vertically
                zIndex: 9,
                width: 640,
                height: 480,
              }}
            />
          </header>
        </div>
      ) : (
        <div>
        
        </div>
      )}
      <RobotImage typedText={textForBot}/>
    </div>
  );
};

export default Home;
